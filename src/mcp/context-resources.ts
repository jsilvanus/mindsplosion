import type { MindsplosionContext, RequestPrincipal } from "./context.js";
import { NotFoundOrForbiddenError } from "../domain/authorization.js";
import { buildInbox, type Inbox } from "../domain/inbox.js";
import type { Alarm, Schedule, Task } from "../domain/model.js";
import { COLLECTION_BY_TYPE, ITEM_TYPES, type ItemType, type LabelableType } from "../db/view-queries.js";

/**
 * Everything the MCP server can read, addressed by URI. The resources handler and the `read`
 * tool both go through readUri, so a client without resource support sees the same data.
 *
 *   mindsplosion://inbox                         what is going on and coming up
 *   mindsplosion://{collection}                  all visible items (projects, goals, tasks, notes,
 *                                                plans, actors, schedules, alarms, labels,
 *                                                repositories, relationships)
 *   mindsplosion://{collection}/{id}             one item
 *   mindsplosion://{collection}/{id}/context     the item with everything linked to it
 *                                                (projects, goals, tasks, labels, repositories)
 *
 * Linked items the principal cannot view are left out; an item the principal cannot view is
 * "not found", whether or not it exists.
 */

export const TYPE_BY_COLLECTION: Record<string, ItemType> = Object.fromEntries(
  ITEM_TYPES.map((type) => [COLLECTION_BY_TYPE[type], type]),
) as Record<string, ItemType>;

export function uriOf(type: ItemType, id?: string, context = false): string {
  return `mindsplosion://${COLLECTION_BY_TYPE[type]}${id ? `/${id}` : ""}${context ? "/context" : ""}`;
}

export async function getItem(context: MindsplosionContext, principal: RequestPrincipal, type: ItemType, id: string): Promise<unknown> {
  switch (type) {
    case "project": return context.projects.getProject(principal, id);
    case "goal": return context.goals.getGoal(principal, id);
    case "task": return context.tasks.getTask(principal, id);
    case "note": return context.notes.getNote(principal, id);
    case "plan": return context.plans.getPlan(principal, id);
    case "actor": return context.actors.getActor(principal, id);
    case "schedule": return context.schedules.getSchedule(principal, id);
    case "alarm": return context.alarms.getAlarm(principal, id);
    case "label": return context.labels.getLabel(principal, id);
    case "repository": return context.repositories.getRepository(principal, id);
  }
}

export async function listItems(context: MindsplosionContext, principal: RequestPrincipal, type: ItemType): Promise<any[]> {
  switch (type) {
    case "project": return context.projects.listProjects(principal);
    case "goal": return context.goals.listGoals(principal);
    case "task": return context.tasks.listTasks(principal);
    case "note": return context.notes.listNotes(principal);
    case "plan": return context.plans.listPlans(principal);
    case "actor": return context.actors.listActors(principal);
    case "schedule": return context.schedules.listSchedules(principal);
    case "alarm": return context.alarms.listAlarms(principal);
    case "label": return context.labels.listLabels(principal);
    case "repository": return context.repositories.listRepositories(principal);
  }
}

export async function buildProjectContext(context: MindsplosionContext, principal: RequestPrincipal, projectId: string) {
  const project = await context.projects.getProject(principal, projectId);
  if (!project) throw new NotFoundOrForbiddenError();
  const v = context.views;
  const [goals, tasks, notes, plans, schedules, alarms, labels, repositories, relationships] = await Promise.all([
    v.linked(principal, "goal", "project_goal", "project_id", "goal_id", projectId),
    v.byColumn(principal, "task", "project_id", projectId),
    v.notesOf(principal, "project", projectId),
    v.plansOf(principal, "project", projectId),
    v.byColumn(principal, "schedule", "project_id", projectId),
    v.byColumn(principal, "alarm", "project_id", projectId),
    v.labelsOf(principal, "project", projectId),
    v.repositoriesOf(principal, projectId),
    v.relationships(principal, { type: "project", id: projectId }),
  ]);
  return { project, goals, tasks, notes, plans, schedules, alarms, labels, repositories, relationships };
}

export async function buildGoalContext(context: MindsplosionContext, principal: RequestPrincipal, goalId: string) {
  const goal = await context.goals.getGoal(principal, goalId);
  if (!goal) throw new NotFoundOrForbiddenError();
  const v = context.views;
  const [projects, actors, tasks, notes, plans, schedules, alarms, labels, relationships] = await Promise.all([
    v.linked(principal, "project", "project_goal", "goal_id", "project_id", goalId),
    v.goalActors(principal, goalId),
    v.byColumn(principal, "task", "goal_id", goalId),
    v.notesOf(principal, "goal", goalId),
    v.plansOf(principal, "goal", goalId),
    v.byColumn(principal, "schedule", "goal_id", goalId),
    v.byColumn(principal, "alarm", "goal_id", goalId),
    v.labelsOf(principal, "goal", goalId),
    v.relationships(principal, { type: "goal", id: goalId }),
  ]);
  return { goal, projects, actors, tasks, notes, plans, schedules, alarms, labels, relationships };
}

export async function buildTaskContext(context: MindsplosionContext, principal: RequestPrincipal, taskId: string) {
  const task = await context.tasks.getTask(principal, taskId);
  if (!task) throw new NotFoundOrForbiddenError();
  const v = context.views;
  // The parent project/goal is included only when visible to the principal.
  const optional = <T>(promise: Promise<T>) => promise.catch(() => undefined);
  const [project, goal, assignees, notes, plans, schedules, alarms, labels] = await Promise.all([
    task.projectId ? optional(context.projects.getProject(principal, task.projectId)) : undefined,
    task.goalId ? optional(context.goals.getGoal(principal, task.goalId)) : undefined,
    v.taskAssignees(principal, taskId),
    v.notesOf(principal, "task", taskId),
    v.plansOf(principal, "task", taskId),
    v.byColumn(principal, "schedule", "task_id", taskId),
    v.byColumn(principal, "alarm", "task_id", taskId),
    v.labelsOf(principal, "task", taskId),
  ]);
  return { task, ...(project ? { project } : {}), ...(goal ? { goal } : {}), assignees, notes, plans, schedules, alarms, labels };
}

export async function buildLabelContext(context: MindsplosionContext, principal: RequestPrincipal, labelId: string) {
  const label = await context.labels.getLabel(principal, labelId);
  if (!label) throw new NotFoundOrForbiddenError();
  const v = context.views;
  const [projects, goals, tasks, plans, notes] = await Promise.all(
    (["project", "goal", "task", "plan", "note"] as LabelableType[]).map((type) => v.withLabel(principal, type, labelId)),
  );
  return { label, projects, goals, tasks, plans, notes };
}

export async function buildRepositoryContext(context: MindsplosionContext, principal: RequestPrincipal, repositoryId: string) {
  const repository = await context.repositories.getRepository(principal, repositoryId);
  if (!repository) throw new NotFoundOrForbiddenError();
  return { repository, projects: await context.views.projectsOfRepository(principal, repositoryId) };
}

export async function buildInboxFor(
  context: MindsplosionContext,
  principal: RequestPrincipal,
  options: { now?: Date; horizonDays?: number } = {},
): Promise<Inbox> {
  const [schedules, alarms, tasks] = await Promise.all([
    context.schedules.listSchedules(principal) as Promise<Schedule[]>,
    context.alarms.listAlarms(principal) as Promise<Alarm[]>,
    context.tasks.listTasks(principal) as Promise<Task[]>,
  ]);
  return buildInbox({ schedules, alarms, tasks }, { now: options.now ?? new Date(), ...(options.horizonDays !== undefined ? { horizonDays: options.horizonDays } : {}) });
}

const CONTEXT_BUILDERS: Partial<Record<ItemType, (c: MindsplosionContext, p: RequestPrincipal, id: string) => Promise<unknown>>> = {
  project: buildProjectContext,
  goal: buildGoalContext,
  task: buildTaskContext,
  label: buildLabelContext,
  repository: buildRepositoryContext,
};

export function isId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(value);
}

export class InvalidUriError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidUriError";
  }
}

/** Reads any mindsplosion:// URI (see the top of this file). */
export async function readUri(context: MindsplosionContext, principal: RequestPrincipal, uri: string): Promise<unknown> {
  const match = /^mindsplosion:\/\/([a-z]+)(?:\/([^/?#]+))?(?:\/(context))?\/?$/.exec(uri.trim());
  if (!match) throw new InvalidUriError(`Invalid resource URI: ${uri}. Expected mindsplosion://{collection}[/{id}[/context]] or mindsplosion://inbox`);
  const [, collection = "", id, contextPart] = match;

  if (collection === "inbox" && !id) return buildInboxFor(context, principal);
  if (collection === "relationships") {
    if (id) throw new InvalidUriError("Relationships are read as a list: mindsplosion://relationships, or through an item's /context");
    return context.views.relationships(principal);
  }

  // Ids are UUIDs (PostgreSQL) or 32 hex digits (SQLite); anything else cannot exist.
  if (id && !isId(id)) throw new NotFoundOrForbiddenError();
  const type = TYPE_BY_COLLECTION[collection];
  if (!type) throw new InvalidUriError(`Unknown collection "${collection}". Known: inbox, relationships, ${Object.keys(TYPE_BY_COLLECTION).join(", ")}`);
  if (!id) return listItems(context, principal, type);
  if (contextPart) {
    const builder = CONTEXT_BUILDERS[type];
    if (!builder) throw new InvalidUriError(`No context view for ${collection}; read mindsplosion://${collection}/${id}`);
    return builder(context, principal, id);
  }
  const item = await getItem(context, principal, type, id);
  if (!item) throw new NotFoundOrForbiddenError();
  return item;
}
