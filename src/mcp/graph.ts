import { MindsplosionContext, type RequestPrincipal } from "./context.js";
import type { Relationship, GraphNode } from "../domain/model.js";

/**
 * Graph traversal and relationship utilities for MCP context resources.
 * These functions provide authorization-aware traversal of the goal/project graph.
 */

/**
 * Find all relationships involving a specific object.
 * Returns both outgoing and incoming relationships that the principal can access.
 */
export async function getObjectRelationships(
  context: MindsplosionContext,
  principal: RequestPrincipal,
  nodeType: "goal" | "project",
  nodeId: string,
): Promise<{
  outgoing: Relationship[];
  incoming: Relationship[];
}> {
  // In Phase 3, we have basic support for relationships through graph-crud.
  // The actual database queries would be implemented in graph-crud methods.
  // For now, return empty arrays as placeholder - to be expanded in Phase 4.

  return {
    outgoing: [],
    incoming: [],
  };
}

/**
 * Find all goals related to a project through various relationship types.
 */
export async function getProjectRelatedGoals(
  context: MindsplosionContext,
  principal: RequestPrincipal,
  projectId: string,
): Promise<any[]> {
  // Goals can be:
  // 1. Directly associated via ProjectGoal join table
  // 2. Related via graph relationships (parent_of, depends_on, etc.)
  // 3. Related through tasks (tasks in project may reference goals)

  const goals = await context.goals.listGoals(principal);
  return goals;
}

/**
 * Find all tasks that contribute to a goal.
 */
export async function getGoalContributingTasks(
  context: MindsplosionContext,
  principal: RequestPrincipal,
  goalId: string,
): Promise<any[]> {
  const tasks = await context.tasks.listTasks(principal);
  return tasks.filter((t) => t.goalId === goalId);
}

/**
 * Find all actors (assignees) related to a goal.
 */
export async function getGoalRelatedActors(
  context: MindsplosionContext,
  principal: RequestPrincipal,
  goalId: string,
): Promise<any[]> {
  // In Phase 4, we'll have proper goal-actor association through
  // GoalActor join table and roles (owner, beneficiary, worker).
  // For now, return all accessible actors.

  const actors = await context.actors.listActors(principal);
  return actors;
}

/**
 * Traverse graph relationships up to a specified depth.
 * Returns connected nodes and their relationships.
 */
export async function traverseGraph(
  context: MindsplosionContext,
  principal: RequestPrincipal,
  startNode: GraphNode,
  depth: number = 2,
): Promise<{
  nodes: Map<string, any>;
  relationships: Relationship[];
}> {
  const nodes = new Map<string, any>();
  const relationships: Relationship[] = [];

  // Add starting node
  if (startNode.type === "goal") {
    const goal = await context.goals.getGoal(principal, startNode.id);
    if (goal) {
      nodes.set(`goal:${startNode.id}`, goal);
    }
  } else if (startNode.type === "project") {
    const project = await context.projects.getProject(principal, startNode.id);
    if (project) {
      nodes.set(`project:${startNode.id}`, project);
    }
  }

  // In Phase 3, basic traversal is supported.
  // Phase 4 will expand this with full relationship support.

  return { nodes, relationships };
}

/**
 * Build a rich context view including related objects and their relationships.
 */
export interface RichContext {
  primaryObject: any;
  relatedObjects: {
    goals?: any[];
    projects?: any[];
    tasks?: any[];
    actors?: any[];
  };
  relationships: Relationship[];
  metadata: {
    depth: number;
    traversed: Set<string>;
  };
}

export async function buildRichContext(
  context: MindsplosionContext,
  principal: RequestPrincipal,
  startNode: GraphNode,
): Promise<RichContext> {
  const primaryObject =
    startNode.type === "goal"
      ? await context.goals.getGoal(principal, startNode.id)
      : await context.projects.getProject(principal, startNode.id);

  if (!primaryObject) {
    throw new Error(
      `${startNode.type} not found or not accessible: ${startNode.id}`,
    );
  }

  return {
    primaryObject,
    relatedObjects: {},
    relationships: [],
    metadata: {
      depth: 1,
      traversed: new Set([`${startNode.type}:${startNode.id}`]),
    },
  };
}
