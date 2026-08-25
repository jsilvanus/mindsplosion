import type { AccessLevel, Id } from "./model";

export type ProtectedObjectType =
  | "actor"
  | "project"
  | "goal"
  | "task"
  | "plan"
  | "note"
  | "schedule"
  | "alarm"
  | "label"
  | "repository";

export interface PrincipalContext {
  principalId: Id;
}

export interface AccessGrantReader {
  getAccess(
    principalId: Id,
    objectType: ProtectedObjectType,
    objectId: Id,
  ): Promise<AccessLevel | null>;
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have access to this resource.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundOrForbiddenError extends Error {
  constructor(message = "Resource not found.") {
    super(message);
    this.name = "NotFoundOrForbiddenError";
  }
}

const rank: Record<AccessLevel, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

export async function requireAccess(
  grants: AccessGrantReader,
  principal: PrincipalContext,
  objectType: ProtectedObjectType,
  objectId: Id,
  required: AccessLevel,
): Promise<void> {
  const actual = await grants.getAccess(
    principal.principalId,
    objectType,
    objectId,
  );

  if (!actual || rank[actual] < rank[required]) {
    // Deliberately avoid saying whether the object exists. This is important
    // for enumeration-resistant CRUD and graph traversal.
    throw new NotFoundOrForbiddenError();
  }
}

export async function canAccess(
  grants: AccessGrantReader,
  principal: PrincipalContext,
  objectType: ProtectedObjectType,
  objectId: Id,
  required: AccessLevel = "viewer",
): Promise<boolean> {
  const actual = await grants.getAccess(
    principal.principalId,
    objectType,
    objectId,
  );

  return actual !== null && rank[actual] >= rank[required];
}

export function assertSamePrincipal(
  principal: PrincipalContext,
  expectedPrincipalId: Id,
): void {
  if (principal.principalId !== expectedPrincipalId) {
    throw new ForbiddenError();
  }
}
