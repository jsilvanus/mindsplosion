import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult, type CallToolRequest, type Tool } from "@modelcontextprotocol/sdk/types.js";
import type { MindsplosionContext, PrincipalResolver, RequestPrincipal } from "./context.js";
import {
  buildGoalContext,
  buildInboxFor,
  buildProjectContext,
  isId,
  listItems,
  readUri,
  uriOf,
} from "./context-resources.js";
import { assertTimeZone, parseRecurrence } from "../domain/recurrence.js";
import { ITEM_TYPES, LABELABLE_TYPES, type ItemType, type LabelableType } from "../db/view-queries.js";

/**
 * MCP tools. Read tools (read, list, search, inbox) return the same data as the resources, for
 * clients that only use tools. Write tools go through the authorized domain layer; the principal
 * always comes from the transport (stdio: fixed, HTTP: access token), never from arguments.
 */

type Args = Record<string, unknown>;

interface ToolDef extends Tool {
  handler: (context: MindsplosionContext, principal: RequestPrincipal, args: Args) => Promise<unknown>;
}

class ToolInputError extends Error {}

// --- argument helpers ------------------------------------------------------------

function str(args: Args, name: string): string {
  const value = args[name];
  if (typeof value !== "string" || !value.trim()) throw new ToolInputError(`${name} is required`);
  return value;
}

function optStr(args: Args, name: string): string | undefined {
  const value = args[name];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new ToolInputError(`${name} must be a string`);
  return value;
}

function id(args: Args, name: string): string {
  const value = str(args, name);
  if (!isId(value)) throw new ToolInputError(`${name} is not a valid id`);
  return value;
}

function optId(args: Args, name: string): string | undefined {
  const value = optStr(args, name);
  if (value !== undefined && !isId(value)) throw new ToolInputError(`${name} is not a valid id`);
  return value;
}

function optNum(args: Args, name: string): number | undefined {
  const value = args[name];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new ToolInputError(`${name} must be a number`);
  return value;
}

function oneOf<T extends string>(args: Args, name: string, values: readonly T[], required: true): T;
function oneOf<T extends string>(args: Args, name: string, values: readonly T[], required?: false): T | undefined;
function oneOf<T extends string>(args: Args, name: string, values: readonly T[], required = false): T | undefined {
  const value = required ? str(args, name) : optStr(args, name);
  if (value === undefined) return undefined;
  if (!values.includes(value as T)) throw new ToolInputError(`${name} must be one of: ${values.join(", ")}`);
  return value as T;
}

/** Any date or date-time JavaScript understands, stored as ISO 8601 UTC. */
function dateTime(args: Args, name: string, required: true): string;
function dateTime(args: Args, name: string, required?: false): string | undefined;
function dateTime(args: Args, name: string, required = false): string | undefined {
  const value = required ? str(args, name) : optStr(args, name);
  if (value === undefined) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new ToolInputError(`${name} must be a date-time such as 2026-10-01T09:00:00+03:00`);
  return date.toISOString();
}

function recurrence(args: Args): string | undefined {
  const value = optStr(args, "recurrence");
  if (value !== undefined) parseRecurrence(value);
  return value;
}

function timezone(args: Args): string | undefined {
  const value = optStr(args, "timezone");
  if (value !== undefined) assertTimeZone(value);
  return value;
}

/** At most one of projectId, goalId, taskId. */
function target(args: Args): { projectId?: string; goalId?: string; taskId?: string } {
  const projectId = optId(args, "projectId");
  const goalId = optId(args, "goalId");
  const taskId = optId(args, "taskId");
  if ([projectId, goalId, taskId].filter(Boolean).length > 1) throw new ToolInputError("Give at most one of projectId, goalId, taskId");
  return { ...(projectId ? { projectId } : {}), ...(goalId ? { goalId } : {}), ...(taskId ? { taskId } : {}) };
}

/** Copies the listed optional string fields that are present. */
function pick(args: Args, names: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of names) {
    const value = optStr(args, name);
    if (value !== undefined) result[name] = value;
  }
  return result;
}

// --- schema helpers ----------------------------------------------------------------

const PROJECT_STATUS = ["idea", "started", "development", "blocked", "staging", "in_production", "needs_checking", "completed", "archived"] as const;
const GOAL_KIND = ["determinate", "qualitative"] as const;
const GOAL_STATUS = ["draft", "active", "paused", "achieved", "abandoned"] as const;
const TASK_STATUS = ["todo", "in_progress", "blocked", "done", "cancelled"] as const;
const ACTOR_TYPE = ["person", "team", "organization", "agent", "other"] as const;
const RELATIONSHIP_TYPE = ["parent_of", "depends_on", "blocks", "enables", "helps", "hurts", "conflicts_with", "related_to", "derived_from", "replaces", "distinct_from"] as const;
const CONTEXT_TARGET = ["project", "goal", "task"] as const;

const s = (description: string) => ({ type: "string", description });
const e = (values: readonly string[], description?: string) => ({ type: "string", enum: [...values], ...(description ? { description } : {}) });
const n = (description: string) => ({ type: "number", description });
const obj = (properties: Record<string, object>, required: string[] = []) => ({ type: "object" as const, properties, ...(required.length ? { required } : {}) });

const DATE_TIME = "ISO 8601 date-time, e.g. 2026-10-01T09:00:00+03:00 (a date alone means 00:00 UTC)";
const RECURRENCE = "Optional repeat rule: daily, weekly, weekdays, monthly, yearly, or an RRULE such as FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;UNTIL=20261231 (FREQ, INTERVAL, BYDAY for weekly, COUNT, UNTIL)";
const TIMEZONE = "IANA time zone the recurrence follows, e.g. Europe/Helsinki (default UTC)";
const TARGET_PROPS = {
  projectId: s("Attach to this project (at most one of projectId, goalId, taskId)"),
  goalId: s("Attach to this goal"),
  taskId: s("Attach to this task"),
};

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };

const ok = { success: true };

const LIST_TYPES = [...ITEM_TYPES, "relationship"] as const;

function withUri(type: ItemType, item: any, full: boolean) {
  const result = { ...item, uri: uriOf(type, item.id) };
  if (!full) {
    for (const field of ["content", "markdown"]) {
      if (typeof result[field] === "string" && result[field].length > 280) {
        result[field] = result[field].slice(0, 280) + "…";
        result.truncated = true;
      }
    }
  }
  return result;
}

const PROJECT_CONTEXT_KEYS: Partial<Record<ItemType, string>> = {
  goal: "goals", task: "tasks", note: "notes", plan: "plans", schedule: "schedules", alarm: "alarms", label: "labels", repository: "repositories",
};
const GOAL_CONTEXT_KEYS: Partial<Record<ItemType, string>> = {
  project: "projects", actor: "actors", task: "tasks", note: "notes", plan: "plans", schedule: "schedules", alarm: "alarms", label: "labels",
};

async function listTool(context: MindsplosionContext, principal: RequestPrincipal, args: Args) {
  const type = oneOf(args, "type", LIST_TYPES, true);
  const limit = Math.max(1, Math.min(optNum(args, "limit") ?? 100, 500));
  const offset = Math.max(0, optNum(args, "offset") ?? 0);
  if (type === "relationship") {
    const all = await context.views.relationships(principal);
    return { type, total: all.length, items: all.slice(offset, offset + limit) };
  }

  let items: any[] | undefined;
  const intersect = (next: any[]) => {
    if (!items) items = next;
    else {
      const ids = new Set(next.map((item) => item.id));
      items = items.filter((item) => ids.has(item.id));
    }
  };

  const projectId = optId(args, "projectId");
  if (projectId) {
    const key = PROJECT_CONTEXT_KEYS[type];
    if (!key) throw new ToolInputError(`projectId does not filter ${type}`);
    intersect((await buildProjectContext(context, principal, projectId) as any)[key]);
  }
  const goalId = optId(args, "goalId");
  if (goalId) {
    const key = GOAL_CONTEXT_KEYS[type];
    if (!key) throw new ToolInputError(`goalId does not filter ${type}`);
    intersect((await buildGoalContext(context, principal, goalId) as any)[key]);
  }
  const labelRef = optStr(args, "label");
  if (labelRef) {
    if (!LABELABLE_TYPES.includes(type as LabelableType)) throw new ToolInputError(`Only ${LABELABLE_TYPES.join(", ")} carry labels`);
    const label = isId(labelRef) ? await context.labels.getLabel(principal, labelRef) : await context.views.findLabelByName(principal, labelRef);
    intersect(label ? await context.views.withLabel(principal, type as LabelableType, label.id) : []);
  }
  if (!items) items = await listItems(context, principal, type);

  const status = optStr(args, "status");
  if (status) items = items.filter((item) => item.status === status);
  return {
    type,
    total: items.length,
    items: items.slice(offset, offset + limit).map((item) => withUri(type, item, args.full === true)),
  };
}

async function resolveLabel(context: MindsplosionContext, principal: RequestPrincipal, args: Args, create: boolean) {
  const labelId = optId(args, "labelId");
  if (labelId) {
    const label = await context.labels.getLabel(principal, labelId);
    if (!label) throw new ToolInputError("Label not found");
    return label;
  }
  const name = optStr(args, "name")?.trim();
  if (!name) throw new ToolInputError("Give labelId or name");
  const existing = await context.views.findLabelByName(principal, name);
  if (existing) return existing;
  if (!create) throw new ToolInputError(`No label named "${name}"`);
  return context.labels.createLabel(principal, { name } as any);
}

/** Provider, owner and name from a repository URL (https or scp-like git@host:owner/name.git). */
export function parseRepositoryUrl(url: string): { provider: string; owner: string; name: string; url: string } | undefined {
  const scp = /^[\w.-]+@([\w.-]+):([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(url);
  let host: string;
  let path: string[];
  if (scp) {
    host = scp[1]!;
    path = [scp[2]!, ...scp[3]!.split("/")];
  } else {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return undefined;
    }
    host = parsed.hostname;
    path = parsed.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
  }
  if (path.length < 2) return undefined;
  const name = path[path.length - 1]!;
  const owner = path.slice(0, -1).join("/");
  const provider = host.replace(/^www\./, "").replace(/\.(com|org)$/, "");
  return { provider, owner, name, url: scp ? `https://${host}/${owner}/${name}` : url.replace(/\.git$/, "").replace(/\/+$/, "") };
}

async function createRepositoryTool(context: MindsplosionContext, principal: RequestPrincipal, args: Args) {
  const url = str(args, "url");
  const parsed = parseRepositoryUrl(url);
  const owner = optStr(args, "owner") ?? parsed?.owner;
  const name = optStr(args, "name") ?? parsed?.name;
  if (!owner || !name) throw new ToolInputError("Could not read owner and name from url; give owner and name");
  const provider = (optStr(args, "provider") ?? parsed?.provider ?? "git").toLowerCase();
  const externalId = optStr(args, "externalId") ?? `${owner}/${name}`.toLowerCase();
  const description = optStr(args, "description");
  const projectId = optId(args, "projectId");

  const existing = (await context.repositories.listRepositories(principal)).find((r) => r.provider === provider && r.externalId === externalId);
  let repository = existing;
  if (!repository) {
    try {
      repository = await context.repositories.createRepository(principal, {
        provider, externalId, owner, name, url: parsed?.url ?? url, metadata: description ? { description } : {},
      });
    } catch (error) {
      if (/unique|duplicate/i.test((error as Error).message)) throw new ToolInputError("This repository is already registered by another account");
      throw error;
    }
  }
  if (projectId) await context.graphOperations.linkRepository(principal, projectId, repository.id, optStr(args, "path"));
  return { ...repository, created: !existing, ...(projectId ? { linkedToProject: projectId } : {}) };
}

async function deleteTool(context: MindsplosionContext, principal: RequestPrincipal, args: Args) {
  const type = oneOf(args, "type", ITEM_TYPES, true);
  const itemId = id(args, "id");
  switch (type) {
    case "project": await context.projects.deleteProject(principal, itemId); break;
    case "goal": await context.goals.deleteGoal(principal, itemId); break;
    case "task": await context.tasks.deleteTask(principal, itemId); break;
    case "note": await context.notes.deleteNote(principal, itemId); break;
    case "plan": await context.plans.deletePlan(principal, itemId); break;
    case "actor": await context.actors.deleteActor(principal, itemId); break;
    case "schedule": await context.schedules.deleteSchedule(principal, itemId); break;
    case "alarm": await context.alarms.deleteAlarm(principal, itemId); break;
    case "label": await context.labels.deleteLabel(principal, itemId); break;
    case "repository": await context.repositories.deleteRepository(principal, itemId); break;
  }
  return { success: true, deleted: { type, id: itemId } };
}

async function attachAfterCreate(context: MindsplosionContext, principal: RequestPrincipal, kind: "note" | "plan", itemId: string, args: Args) {
  const t = target(args);
  const [targetType, targetId] = t.projectId ? ["project", t.projectId] as const : t.goalId ? ["goal", t.goalId] as const : t.taskId ? ["task", t.taskId] as const : [undefined, undefined];
  if (!targetType) return;
  if (kind === "note") await context.contextOperations.attachNote(principal, itemId, targetType, targetId);
  else await context.contextOperations.attachPlan(principal, itemId, targetType, targetId);
}

// --- tools -------------------------------------------------------------------------

export const TOOLS: ToolDef[] = [
  // Reading
  {
    name: "inbox",
    title: "Inbox",
    description: "What is going on and what is coming up: ringing alarms, schedules happening now and within the horizon, and overdue or soon-due tasks. Start a session with this.",
    inputSchema: obj({ horizonDays: n("How many days ahead to look (default 7, max 366)"), now: s("Evaluate at this time instead of now (ISO 8601)") }),
    annotations: READ_ONLY,
    handler: async (context, principal, args) => {
      const horizonDays = optNum(args, "horizonDays");
      if (horizonDays !== undefined && (horizonDays <= 0 || horizonDays > 366)) throw new ToolInputError("horizonDays must be between 0 and 366");
      const now = dateTime(args, "now");
      return buildInboxFor(context, principal, { ...(now ? { now: new Date(now) } : {}), ...(horizonDays !== undefined ? { horizonDays } : {}) });
    },
  },
  {
    name: "read",
    title: "Read by URI",
    description: "Read anything by its mindsplosion:// URI: mindsplosion://inbox, mindsplosion://{collection} (projects, goals, tasks, notes, plans, actors, schedules, alarms, labels, repositories, relationships), mindsplosion://{collection}/{id}, or mindsplosion://{projects|goals|tasks|labels|repositories}/{id}/context for the item with everything linked to it.",
    inputSchema: obj({ uri: s("A mindsplosion:// URI, e.g. mindsplosion://projects/<id>/context") }, ["uri"]),
    annotations: READ_ONLY,
    handler: (context, principal, args) => readUri(context, principal, str(args, "uri")),
  },
  {
    name: "list",
    title: "List items",
    description: "List items of one type, optionally filtered by project, goal, label and status. Long note and plan texts are shortened unless full is true; read an item's uri for the whole item.",
    inputSchema: obj({
      type: e(LIST_TYPES, "What to list"),
      projectId: s("Only items linked to this project (goals, tasks, notes, plans, schedules, alarms, labels, repositories)"),
      goalId: s("Only items linked to this goal (projects, actors, tasks, notes, plans, schedules, alarms, labels)"),
      label: s("Only items with this label (label id or name; projects, goals, tasks, plans, notes)"),
      status: s("Only items with this status (projects, goals, tasks)"),
      limit: n("Max items (default 100, max 500)"),
      offset: n("Skip this many items"),
      full: { type: "boolean", description: "Return full note and plan texts" },
    }, ["type"]),
    annotations: READ_ONLY,
    handler: listTool,
  },
  {
    name: "search",
    title: "Search",
    description: "Case-insensitive text search across names, titles, descriptions, note contents and plan texts. Every word must match. Returns hits with a uri to read.",
    inputSchema: obj({
      query: s("Words to find"),
      types: { type: "array", items: e(ITEM_TYPES), description: "Limit to these types" },
      limit: n("Max hits (default 20, max 100)"),
    }, ["query"]),
    annotations: READ_ONLY,
    handler: async (context, principal, args) => {
      const types = Array.isArray(args.types) ? args.types.filter((t): t is ItemType => ITEM_TYPES.includes(t as ItemType)) : undefined;
      const limit = Math.max(1, Math.min(optNum(args, "limit") ?? 20, 100));
      return context.views.search(principal, str(args, "query"), types?.length ? types : undefined, limit);
    },
  },

  // Projects, goals, tasks
  {
    name: "create_project", description: "Create a new project",
    inputSchema: obj({ name: s("Project name"), description: s("Project description"), status: e(PROJECT_STATUS, "Project status") }, ["name", "status"]),
    annotations: WRITE,
    handler: (c, p, a) => c.projects.createProject(p, { name: str(a, "name"), status: oneOf(a, "status", PROJECT_STATUS, true), ...pick(a, ["description"]) } as any),
  },
  {
    name: "update_project", description: "Update an existing project",
    inputSchema: obj({ projectId: s("Project id"), name: s("Name"), description: s("Description"), status: e(PROJECT_STATUS) }, ["projectId"]),
    annotations: WRITE,
    handler: (c, p, a) => c.projects.updateProject(p, id(a, "projectId"), { ...pick(a, ["name", "description"]), ...(oneOf(a, "status", PROJECT_STATUS) ? { status: oneOf(a, "status", PROJECT_STATUS) } : {}) } as any),
  },
  {
    name: "create_goal", description: "Create a new goal",
    inputSchema: obj({ statement: s("The goal as a statement"), description: s("Description"), kind: e(GOAL_KIND), status: e(GOAL_STATUS) }, ["statement", "kind", "status"]),
    annotations: WRITE,
    handler: (c, p, a) => c.goals.createGoal(p, { statement: str(a, "statement"), kind: oneOf(a, "kind", GOAL_KIND, true), status: oneOf(a, "status", GOAL_STATUS, true), ...pick(a, ["description"]) } as any),
  },
  {
    name: "update_goal", description: "Update an existing goal",
    inputSchema: obj({ goalId: s("Goal id"), statement: s("Statement"), description: s("Description"), kind: e(GOAL_KIND), status: e(GOAL_STATUS) }, ["goalId"]),
    annotations: WRITE,
    handler: (c, p, a) => c.goals.updateGoal(p, id(a, "goalId"), {
      ...pick(a, ["statement", "description"]),
      ...(oneOf(a, "kind", GOAL_KIND) ? { kind: oneOf(a, "kind", GOAL_KIND) } : {}),
      ...(oneOf(a, "status", GOAL_STATUS) ? { status: oneOf(a, "status", GOAL_STATUS) } : {}),
    } as any),
  },
  {
    name: "create_task", description: "Create a new task, optionally in a project and/or for a goal",
    inputSchema: obj({ title: s("Title"), description: s("Description"), status: e(TASK_STATUS), priority: n("Priority (your own scale, e.g. 1 = highest)"), dueAt: s(`Due date. ${DATE_TIME}`), projectId: s("Project id"), goalId: s("Goal id") }, ["title", "status"]),
    annotations: WRITE,
    handler: (c, p, a) => c.tasks.createTask(p, {
      title: str(a, "title"),
      status: oneOf(a, "status", TASK_STATUS, true),
      ...pick(a, ["description"]),
      ...(optNum(a, "priority") !== undefined ? { priority: optNum(a, "priority") } : {}),
      ...(dateTime(a, "dueAt") ? { dueAt: dateTime(a, "dueAt") } : {}),
      ...(optId(a, "projectId") ? { projectId: optId(a, "projectId") } : {}),
      ...(optId(a, "goalId") ? { goalId: optId(a, "goalId") } : {}),
    } as any),
  },
  {
    name: "update_task", description: "Update an existing task (status done sets completedAt)",
    inputSchema: obj({ taskId: s("Task id"), title: s("Title"), description: s("Description"), status: e(TASK_STATUS), priority: n("Priority"), dueAt: s(`Due date. ${DATE_TIME}`), projectId: s("Move to this project"), goalId: s("Move to this goal") }, ["taskId"]),
    annotations: WRITE,
    handler: (c, p, a) => c.tasks.updateTask(p, id(a, "taskId"), {
      ...pick(a, ["title", "description"]),
      ...(oneOf(a, "status", TASK_STATUS) ? { status: oneOf(a, "status", TASK_STATUS) } : {}),
      ...(optNum(a, "priority") !== undefined ? { priority: optNum(a, "priority") } : {}),
      ...(dateTime(a, "dueAt") ? { dueAt: dateTime(a, "dueAt") } : {}),
      ...(optId(a, "projectId") ? { projectId: optId(a, "projectId") } : {}),
      ...(optId(a, "goalId") ? { goalId: optId(a, "goalId") } : {}),
    } as any),
  },

  // Notes, plans, actors
  {
    name: "create_note", description: "Create a note, optionally attached to a project, goal or task",
    inputSchema: obj({ title: s("Title"), content: s("Markdown content"), ...TARGET_PROPS }, ["content"]),
    annotations: WRITE,
    handler: async (c, p, a) => {
      target(a);
      const created = await c.notes.createNote(p, { content: str(a, "content"), ...pick(a, ["title"]) } as any);
      await attachAfterCreate(c, p, "note", created.id, a);
      return created;
    },
  },
  {
    name: "update_note", description: "Update an existing note",
    inputSchema: obj({ noteId: s("Note id"), title: s("Title"), content: s("Markdown content (replaces the old content)") }, ["noteId"]),
    annotations: WRITE,
    handler: (c, p, a) => c.notes.updateNote(p, id(a, "noteId"), pick(a, ["title", "content"])),
  },
  {
    name: "create_plan", description: "Create a Markdown plan, optionally attached to a project, goal or task",
    inputSchema: obj({ title: s("Title"), markdown: s("Plan in Markdown"), ...TARGET_PROPS }, ["title", "markdown"]),
    annotations: WRITE,
    handler: async (c, p, a) => {
      target(a);
      const created = await c.plans.createPlan(p, { title: str(a, "title"), markdown: typeof a.markdown === "string" ? a.markdown : "" });
      await attachAfterCreate(c, p, "plan", created.id, a);
      return created;
    },
  },
  {
    name: "update_plan", description: "Update an existing plan",
    inputSchema: obj({ planId: s("Plan id"), title: s("Title"), markdown: s("Plan in Markdown (replaces the old text)") }, ["planId"]),
    annotations: WRITE,
    handler: (c, p, a) => c.plans.updatePlan(p, id(a, "planId"), pick(a, ["title", "markdown"])),
  },
  {
    name: "attach", description: "Attach a note or plan to a project, goal or task (it then shows in their context)",
    inputSchema: obj({ kind: e(["note", "plan"]), id: s("Note or plan id"), targetType: e(CONTEXT_TARGET), targetId: s("Project, goal or task id") }, ["kind", "id", "targetType", "targetId"]),
    annotations: WRITE,
    handler: async (c, p, a) => {
      const kind = oneOf(a, "kind", ["note", "plan"] as const, true);
      const targetType = oneOf(a, "targetType", CONTEXT_TARGET, true);
      if (kind === "note") await c.contextOperations.attachNote(p, id(a, "id"), targetType, id(a, "targetId"));
      else await c.contextOperations.attachPlan(p, id(a, "id"), targetType, id(a, "targetId"));
      return ok;
    },
  },
  {
    name: "detach", description: "Detach a note or plan from a project, goal or task",
    inputSchema: obj({ kind: e(["note", "plan"]), id: s("Note or plan id"), targetType: e(CONTEXT_TARGET), targetId: s("Project, goal or task id") }, ["kind", "id", "targetType", "targetId"]),
    annotations: WRITE,
    handler: async (c, p, a) => {
      const kind = oneOf(a, "kind", ["note", "plan"] as const, true);
      const targetType = oneOf(a, "targetType", CONTEXT_TARGET, true);
      if (kind === "note") await c.contextOperations.detachNote(p, id(a, "id"), targetType, id(a, "targetId"));
      else await c.contextOperations.detachPlan(p, id(a, "id"), targetType, id(a, "targetId"));
      return ok;
    },
  },
  {
    name: "create_actor", description: "Create a new actor (person, team, organization, agent)",
    inputSchema: obj({ name: s("Name"), type: e(ACTOR_TYPE), description: s("Description") }, ["name", "type"]),
    annotations: WRITE,
    handler: (c, p, a) => c.actors.createActor(p, { type: oneOf(a, "type", ACTOR_TYPE, true), name: str(a, "name"), ...pick(a, ["description"]) } as any),
  },
  {
    name: "update_actor", description: "Update an existing actor",
    inputSchema: obj({ actorId: s("Actor id"), name: s("Name"), type: e(ACTOR_TYPE), description: s("Description") }, ["actorId"]),
    annotations: WRITE,
    handler: (c, p, a) => c.actors.updateActor(p, id(a, "actorId"), { ...pick(a, ["name", "description"]), ...(oneOf(a, "type", ACTOR_TYPE) ? { type: oneOf(a, "type", ACTOR_TYPE) } : {}) } as any),
  },

  // Schedules and alarms
  {
    name: "create_schedule", description: "Create a schedule entry (a meeting, deadline window, recurring work block …), optionally repeating and attached to a project, goal or task. It shows in the inbox while it is going on and when it is coming up.",
    inputSchema: obj({ title: s("Title"), startAt: s(`Start. ${DATE_TIME}`), endAt: s(`End (optional). ${DATE_TIME}`), recurrence: s(RECURRENCE), timezone: s(TIMEZONE), ...TARGET_PROPS }, ["title", "startAt"]),
    annotations: WRITE,
    handler: (c, p, a) => {
      const startAt = dateTime(a, "startAt", true);
      const endAt = dateTime(a, "endAt");
      if (endAt && endAt < startAt) throw new ToolInputError("endAt must not be before startAt");
      const rec = recurrence(a);
      const tz = timezone(a);
      return c.schedules.createSchedule(p, { title: str(a, "title"), startAt, ...(endAt ? { endAt } : {}), ...(rec ? { recurrence: rec } : {}), ...(tz ? { timezone: tz } : {}), ...target(a) });
    },
  },
  {
    name: "update_schedule", description: "Update a schedule entry",
    inputSchema: obj({ scheduleId: s("Schedule id"), title: s("Title"), startAt: s(DATE_TIME), endAt: s(DATE_TIME), recurrence: s(RECURRENCE), timezone: s(TIMEZONE) }, ["scheduleId"]),
    annotations: WRITE,
    handler: async (c, p, a) => {
      const scheduleId = id(a, "scheduleId");
      const startAt = dateTime(a, "startAt");
      const endAt = dateTime(a, "endAt");
      const current = await c.schedules.getSchedule(p, scheduleId);
      const effectiveEnd = endAt ?? current?.endAt;
      if (effectiveEnd && effectiveEnd < (startAt ?? current!.startAt)) throw new ToolInputError("endAt must not be before startAt");
      const rec = recurrence(a);
      const tz = timezone(a);
      return c.schedules.updateSchedule(p, scheduleId, { ...pick(a, ["title"]), ...(startAt ? { startAt } : {}), ...(endAt ? { endAt } : {}), ...(rec ? { recurrence: rec } : {}), ...(tz ? { timezone: tz } : {}) });
    },
  },
  {
    name: "create_alarm", description: "Create an alarm (a reminder), optionally repeating and attached to a project, goal or task. It rings in the inbox from triggerAt until dismissed; a repeating alarm rings again at its next occurrence.",
    inputSchema: obj({ title: s("What to be reminded of"), triggerAt: s(`When it rings. ${DATE_TIME}`), recurrence: s(RECURRENCE), timezone: s(TIMEZONE), ...TARGET_PROPS }, ["title", "triggerAt"]),
    annotations: WRITE,
    handler: (c, p, a) => {
      const rec = recurrence(a);
      const tz = timezone(a);
      return c.alarms.createAlarm(p, { title: str(a, "title"), triggerAt: dateTime(a, "triggerAt", true), ...(rec ? { recurrence: rec } : {}), ...(tz ? { timezone: tz } : {}), ...target(a) });
    },
  },
  {
    name: "update_alarm", description: "Update an alarm (a new triggerAt after dismissing makes a one-off alarm ring again)",
    inputSchema: obj({ alarmId: s("Alarm id"), title: s("Title"), triggerAt: s(DATE_TIME), recurrence: s(RECURRENCE), timezone: s(TIMEZONE) }, ["alarmId"]),
    annotations: WRITE,
    handler: async (c, p, a) => {
      const alarmId = id(a, "alarmId");
      const triggerAt = dateTime(a, "triggerAt");
      const rec = recurrence(a);
      const tz = timezone(a);
      const updated = await c.alarms.updateAlarm(p, alarmId, { ...pick(a, ["title"]), ...(triggerAt ? { triggerAt } : {}), ...(rec ? { recurrence: rec } : {}), ...(tz ? { timezone: tz } : {}) });
      return updated;
    },
  },
  {
    name: "dismiss_alarm", description: "Dismiss a ringing alarm (a repeating alarm rings again at its next occurrence)",
    inputSchema: obj({ alarmId: s("Alarm id") }, ["alarmId"]),
    annotations: WRITE,
    handler: (c, p, a) => c.alarms.dismissAlarm(p, id(a, "alarmId")),
  },

  // Labels
  {
    name: "create_label", description: "Create a label",
    inputSchema: obj({ name: s("Label name (unique for you)"), description: s("Description") }, ["name"]),
    annotations: WRITE,
    handler: (c, p, a) => c.labels.createLabel(p, { name: str(a, "name").trim(), ...pick(a, ["description"]) } as any),
  },
  {
    name: "update_label", description: "Rename or describe a label",
    inputSchema: obj({ labelId: s("Label id"), name: s("New name"), description: s("Description") }, ["labelId"]),
    annotations: WRITE,
    handler: (c, p, a) => c.labels.updateLabel(p, id(a, "labelId"), pick(a, ["name", "description"])),
  },
  {
    name: "add_label", description: "Put a label on a project, goal, task, plan or note. Give labelId, or name (the label is created if you have none by that name).",
    inputSchema: obj({ targetType: e(LABELABLE_TYPES), targetId: s("Id of the item"), labelId: s("Label id"), name: s("Label name") }, ["targetType", "targetId"]),
    annotations: WRITE,
    handler: async (c, p, a) => {
      const targetType = oneOf(a, "targetType", LABELABLE_TYPES, true);
      const targetId = id(a, "targetId");
      const label = await resolveLabel(c, p, a, true);
      await c.graphOperations.label(p, targetType, targetId, label.id);
      return { success: true, label };
    },
  },
  {
    name: "remove_label", description: "Remove a label from a project, goal, task, plan or note (labelId or name)",
    inputSchema: obj({ targetType: e(LABELABLE_TYPES), targetId: s("Id of the item"), labelId: s("Label id"), name: s("Label name") }, ["targetType", "targetId"]),
    annotations: WRITE,
    handler: async (c, p, a) => {
      const targetType = oneOf(a, "targetType", LABELABLE_TYPES, true);
      const label = await resolveLabel(c, p, a, false);
      await c.graphOperations.unlabel(p, targetType, id(a, "targetId"), label.id);
      return ok;
    },
  },

  // Repositories
  {
    name: "create_repository", description: "Register a code repository by URL (provider, owner and name are read from GitHub/GitLab-style URLs) and optionally link it to a project. Returns the existing one if you already registered it.",
    inputSchema: obj({
      url: s("Repository URL, e.g. https://github.com/owner/name"),
      provider: s("Provider, e.g. github (default: from the URL host)"),
      owner: s("Owner (default: from the URL)"),
      name: s("Name (default: from the URL)"),
      externalId: s("Provider's id for it (default: owner/name, lower case)"),
      description: s("Description"),
      projectId: s("Link to this project"),
      path: s("Folder inside the repository that belongs to the project (monorepos)"),
    }, ["url"]),
    annotations: WRITE,
    handler: createRepositoryTool,
  },
  {
    name: "update_repository", description: "Update a registered repository",
    inputSchema: obj({ repositoryId: s("Repository id"), url: s("URL"), owner: s("Owner"), name: s("Name"), description: s("Description") }, ["repositoryId"]),
    annotations: WRITE,
    handler: async (c, p, a) => {
      const repositoryId = id(a, "repositoryId");
      const description = optStr(a, "description");
      let metadata: Record<string, unknown> | undefined;
      if (description !== undefined) {
        const current = await c.repositories.getRepository(p, repositoryId);
        metadata = { ...(current?.metadata ?? {}), description };
      }
      return c.repositories.updateRepository(p, repositoryId, { ...pick(a, ["url", "owner", "name"]), ...(metadata ? { metadata } : {}) });
    },
  },
  {
    name: "link_repository", description: "Link a repository to a project (optionally a folder inside it)",
    inputSchema: obj({ projectId: s("Project id"), repositoryId: s("Repository id"), path: s("Folder inside the repository") }, ["projectId", "repositoryId"]),
    annotations: WRITE,
    handler: async (c, p, a) => { await c.graphOperations.linkRepository(p, id(a, "projectId"), id(a, "repositoryId"), optStr(a, "path")); return ok; },
  },
  {
    name: "unlink_repository", description: "Unlink a repository from a project",
    inputSchema: obj({ projectId: s("Project id"), repositoryId: s("Repository id"), path: s("Folder, if the link had one") }, ["projectId", "repositoryId"]),
    annotations: WRITE,
    handler: async (c, p, a) => { await c.graphOperations.unlinkRepository(p, id(a, "projectId"), id(a, "repositoryId"), optStr(a, "path")); return ok; },
  },

  // Graph
  {
    name: "add_goal_to_project", description: "Add a goal to a project",
    inputSchema: obj({ projectId: s("Project id"), goalId: s("Goal id") }, ["projectId", "goalId"]),
    annotations: WRITE,
    handler: async (c, p, a) => { await c.graphOperations.addGoalToProject(p, id(a, "projectId"), id(a, "goalId")); return ok; },
  },
  {
    name: "remove_goal_from_project", description: "Remove a goal from a project",
    inputSchema: obj({ projectId: s("Project id"), goalId: s("Goal id") }, ["projectId", "goalId"]),
    annotations: WRITE,
    handler: async (c, p, a) => { await c.graphOperations.removeGoalFromProject(p, id(a, "projectId"), id(a, "goalId")); return ok; },
  },
  {
    name: "add_relationship", description: "Create a relationship between goals and/or projects",
    inputSchema: obj({ sourceType: e(["goal", "project"]), sourceId: s("Source id"), targetType: e(["goal", "project"]), targetId: s("Target id"), type: e(RELATIONSHIP_TYPE), description: s("Description") }, ["sourceType", "sourceId", "targetType", "targetId", "type"]),
    annotations: WRITE,
    handler: (c, p, a) => c.graphOperations.addRelationship(p, {
      sourceType: oneOf(a, "sourceType", ["goal", "project"] as const, true),
      sourceId: id(a, "sourceId"),
      targetType: oneOf(a, "targetType", ["goal", "project"] as const, true),
      targetId: id(a, "targetId"),
      type: oneOf(a, "type", RELATIONSHIP_TYPE, true),
      ...pick(a, ["description"]),
    }),
  },
  {
    name: "delete_relationship", description: "Delete a relationship by id",
    inputSchema: obj({ relationshipId: s("Relationship id") }, ["relationshipId"]),
    annotations: DESTRUCTIVE,
    handler: async (c, p, a) => { await c.graphOperations.deleteRelationship(p, id(a, "relationshipId")); return ok; },
  },
  {
    name: "delete", description: "Delete an item you own (project, goal, task, note, plan, actor, schedule, alarm, label or repository). Cannot be undone.",
    inputSchema: obj({ type: e(ITEM_TYPES), id: s("Item id") }, ["type", "id"]),
    annotations: DESTRUCTIVE,
    handler: deleteTool,
  },
];

const BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

export function setupToolHandlers(server: Server, context: MindsplosionContext, resolvePrincipal: PrincipalResolver) {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(({ handler: _handler, ...tool }) => tool),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest): Promise<CallToolResult> => {
    const principal = await resolvePrincipal();
    const { name, arguments: args = {} } = request.params;
    try {
      const tool = BY_NAME.get(name);
      if (!tool) throw new ToolInputError(`Unknown tool: ${name}`);
      const result = await tool.handler(context, principal, args as Args);
      return { isError: false, content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  });
}
