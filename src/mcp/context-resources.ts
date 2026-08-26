import { MindsplosionContext, type RequestPrincipal } from "./context.js";

/**
 * Context resources provide semantic slices of the domain graph.
 * These are views over the same domain data, not separate stored objects.
 *
 * Resource URIs:
 * - mindsplosion://projects/{id}/context
 * - mindsplosion://projects/{id}/goals
 * - mindsplosion://goals/{id}/context
 * - mindsplosion://tasks/{id}/context
 *
 * Phase 3 implementation: Context resources with authorization-aware graph traversal.
 */

export interface ProjectContext {
  project: any;
  goals: any[];
  tasks: any[];
  relationships: any[];
}

export interface GoalContext {
  goal: any;
  project?: any;
  actors: any[];
  tasks: any[];
  relationships: any[];
}

export interface TaskContext {
  task: any;
  project?: any;
  goal?: any;
  assignees: any[];
}

/**
 * Build a project context view.
 * Includes the project, its goals, tasks, and relationships.
 * Respects authorization: only includes accessible objects.
 */
export async function buildProjectContext(
  context: MindsplosionContext,
  principal: RequestPrincipal,
  projectId: string,
): Promise<ProjectContext> {
  const project = await context.projects.getProject(principal, projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const goals = await context.goals.listGoals(principal);
  const tasks = await context.tasks.listTasks(principal);

  // Filter to only tasks in this project
  // Note: Goals are separate; ProjectGoal is a join table
  // A real implementation would use database queries for better performance
  const projectTasks = tasks.filter((t) => t.projectId === projectId);

  // In Phase 3, relationships are available but not yet queried by node.
  // Phase 4 will add listRelationshipsForNode to graph-crud.
  // For now, collect all relationships that mention this project.
  let relationships: any[] = [];
  try {
    // Placeholder: In Phase 4, we'll have a proper query method.
    // For now, we return empty to avoid errors.
    relationships = [];
  } catch {
    relationships = [];
  }

  return {
    project,
    goals,
    tasks: projectTasks,
    relationships,
  };
}

/**
 * Build a goal context view.
 * Includes the goal, its related project, actors, and tasks.
 * Respects authorization.
 */
export async function buildGoalContext(
  context: MindsplosionContext,
  principal: RequestPrincipal,
  goalId: string,
): Promise<GoalContext> {
  const goal = await context.goals.getGoal(principal, goalId);
  if (!goal) {
    throw new Error(`Goal not found: ${goalId}`);
  }

  const actors = await context.actors.listActors(principal);
  const tasks = await context.tasks.listTasks(principal);

  // Filter tasks to those in this goal
  const goalTasks = tasks.filter((t) => t.goalId === goalId);

  // In Phase 4, we'll have proper goal-actor associations through GoalActor join table.
  // For now, return all accessible actors.

  // Phase 3: Relationships are placeholder (see Phase 4 for full implementation).
  let relationships: any[] = [];

  return {
    goal,
    actors,
    tasks: goalTasks,
    relationships,
  };
}

/**
 * Build a task context view.
 * Includes the task, its related project/goal, and assignees.
 */
export async function buildTaskContext(
  context: MindsplosionContext,
  principal: RequestPrincipal,
  taskId: string,
): Promise<TaskContext> {
  const task = await context.tasks.getTask(principal, taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const actors = await context.actors.listActors(principal);

  let project;
  if (task.projectId) {
    project = await context.projects.getProject(principal, task.projectId);
  }

  let goal;
  if (task.goalId) {
    goal = await context.goals.getGoal(principal, task.goalId);
  }

  return {
    task,
    project,
    goal,
    assignees: actors,
  };
}
