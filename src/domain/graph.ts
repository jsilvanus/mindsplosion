import {
  NotFoundOrForbiddenError,
  type AccessGrantReader,
  canAccess,
  type PrincipalContext,
} from "./authorization";
import type { GraphNode, Id, Relationship } from "./model";

export interface GraphRepository {
  getRelationship(id: Id): Promise<Relationship | null>;
  listFrom(source: GraphNode): Promise<Relationship[]>;
  listTo(target: GraphNode): Promise<Relationship[]>;
}

async function visibleNode(
  grants: AccessGrantReader,
  principal: PrincipalContext,
  node: GraphNode,
): Promise<boolean> {
  return canAccess(grants, principal, node.type, node.id, "viewer");
}

export class AuthorizedGraphService {
  constructor(
    private readonly graph: GraphRepository,
    private readonly grants: AccessGrantReader,
  ) {}

  async getRelationship(
    principal: PrincipalContext,
    id: Id,
  ): Promise<Relationship | null> {
    const relationship = await this.graph.getRelationship(id);
    if (!relationship) return null;

    const [sourceVisible, targetVisible] = await Promise.all([
      visibleNode(this.grants, principal, relationship.source),
      visibleNode(this.grants, principal, relationship.target),
    ]);

    if (!sourceVisible || !targetVisible) {
      throw new NotFoundOrForbiddenError();
    }

    return relationship;
  }

  async outgoing(
    principal: PrincipalContext,
    source: GraphNode,
  ): Promise<Relationship[]> {
    if (!(await visibleNode(this.grants, principal, source))) {
      throw new NotFoundOrForbiddenError();
    }

    const relationships = await this.graph.listFrom(source);
    const visible: Relationship[] = [];

    // Filter targets before returning edges. Never return a relationship whose
    // target is inaccessible, even if the source itself is visible.
    for (const relationship of relationships) {
      if (await visibleNode(this.grants, principal, relationship.target)) {
        visible.push(relationship);
      }
    }

    return visible;
  }

  async incoming(
    principal: PrincipalContext,
    target: GraphNode,
  ): Promise<Relationship[]> {
    if (!(await visibleNode(this.grants, principal, target))) {
      throw new NotFoundOrForbiddenError();
    }

    const relationships = await this.graph.listTo(target);
    const visible: Relationship[] = [];

    for (const relationship of relationships) {
      if (await visibleNode(this.grants, principal, relationship.source)) {
        visible.push(relationship);
      }
    }

    return visible;
  }
}
