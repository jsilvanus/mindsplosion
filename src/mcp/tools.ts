import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult, type CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { MindsplosionContext, type RequestPrincipal } from "./context.js";

/** Tool handlers expose domain mutations as MCP tools. */

const TOOLS: any[] = [
  // Project operations
  { name: "create_project", description: "Create a new project", inputSchema: { type: "object", properties: { name: { type: "string", description: "Project name" }, description: { type: "string", description: "Project description" }, status: { type: "string", enum: ["idea", "started", "development", "blocked", "staging", "in_production", "needs_checking", "completed", "archived"], description: "Project status" } }, required: ["name", "status"] } },
  { name: "update_project", description: "Update an existing project", inputSchema: { type: "object", properties: { projectId: { type: "string" }, name: { type: "string" }, description: { type: "string" }, status: { type: "string", enum: ["idea", "started", "development", "blocked", "staging", "in_production", "needs_checking", "completed", "archived"] } }, required: ["projectId"] } },
  // Goal operations
  { name: "create_goal", description: "Create a new goal", inputSchema: { type: "object", properties: { statement: { type: "string" }, description: { type: "string" }, kind: { type: "string", enum: ["determinate", "qualitative"] }, status: { type: "string", enum: ["draft", "active", "paused", "achieved", "abandoned"] } }, required: ["statement", "kind", "status"] } },
  { name: "update_goal", description: "Update an existing goal", inputSchema: { type: "object", properties: { goalId: { type: "string" }, statement: { type: "string" }, description: { type: "string" }, kind: { type: "string", enum: ["determinate", "qualitative"] }, status: { type: "string", enum: ["draft", "active", "paused", "achieved", "abandoned"] } }, required: ["goalId"] } },
  // Task operations
  { name: "create_task", description: "Create a new task", inputSchema: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, status: { type: "string", enum: ["todo", "in_progress", "blocked", "done", "cancelled"] }, priority: { type: "number" }, dueAt: { type: "string" }, projectId: { type: "string" }, goalId: { type: "string" } }, required: ["title", "status"] } },
  { name: "update_task", description: "Update an existing task", inputSchema: { type: "object", properties: { taskId: { type: "string" }, title: { type: "string" }, description: { type: "string" }, status: { type: "string", enum: ["todo", "in_progress", "blocked", "done", "cancelled"] }, priority: { type: "number" }, dueAt: { type: "string" } }, required: ["taskId"] } },
  // Note operations
  { name: "create_note", description: "Create a new note", inputSchema: { type: "object", properties: { title: { type: "string" }, content: { type: "string" } }, required: ["content"] } },
  { name: "update_note", description: "Update an existing note", inputSchema: { type: "object", properties: { noteId: { type: "string" }, title: { type: "string" }, content: { type: "string" } }, required: ["noteId"] } },
  // Actor operations
  { name: "create_actor", description: "Create a new actor", inputSchema: { type: "object", properties: { name: { type: "string" }, type: { type: "string", enum: ["person", "team", "organization", "agent", "other"] }, description: { type: "string" } }, required: ["name", "type"] } },
  // Plan operations
  { name: "create_plan", description: "Create a new plan", inputSchema: { type: "object", properties: { title: { type: "string" }, markdown: { type: "string" } }, required: ["title", "markdown"] } },
  { name: "update_plan", description: "Update an existing plan", inputSchema: { type: "object", properties: { planId: { type: "string" }, title: { type: "string" }, markdown: { type: "string" } }, required: ["planId"] } },
  // Semantic operations
  { name: "add_goal_to_project", description: "Add a goal to a project", inputSchema: { type: "object", properties: { projectId: { type: "string" }, goalId: { type: "string" } }, required: ["projectId", "goalId"] } },
  { name: "add_relationship", description: "Create a relationship between a goal and/or project", inputSchema: { type: "object", properties: { sourceType: { type: "string", enum: ["goal", "project"] }, sourceId: { type: "string" }, targetType: { type: "string", enum: ["goal", "project"] }, targetId: { type: "string" }, type: { type: "string", enum: ["parent_of", "depends_on", "blocks", "enables", "helps", "hurts", "conflicts_with", "related_to", "derived_from", "replaces", "distinct_from"] }, description: { type: "string" } }, required: ["sourceType", "sourceId", "targetType", "targetId", "type"] } },
  { name: "delete_relationship", description: "Delete a relationship by ID", inputSchema: { type: "object", properties: { relationshipId: { type: "string" } }, required: ["relationshipId"] } },
];

export function setupToolHandlers(server: Server, context: MindsplosionContext) {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest): Promise<CallToolResult> => {
    const principal = await context.resolvePrincipal("default-principal");
    const { name, arguments: args = {} } = request.params;
    try {
      const result = await handleToolCall(context, principal, name, args);
      return { isError: false, content: [{ type: "text", text: result }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  });
}

async function handleToolCall(context: MindsplosionContext, principal: RequestPrincipal, name: string, args: any): Promise<string> {
  switch (name) {
    case "create_project": return JSON.stringify(await context.projects.createProject(principal, { name: args.name, status: args.status, ...(args.description && { description: args.description }) }), null, 2);
    case "update_project": return JSON.stringify(await context.projects.updateProject(principal, args.projectId, { ...(args.name && { name: args.name }), ...(args.description && { description: args.description }), ...(args.status && { status: args.status }) }), null, 2);
    case "create_goal": return JSON.stringify(await context.goals.createGoal(principal, { statement: args.statement, kind: args.kind, status: args.status, ...(args.description && { description: args.description }) }), null, 2);
    case "update_goal": return JSON.stringify(await context.goals.updateGoal(principal, args.goalId, { ...(args.statement && { statement: args.statement }), ...(args.description && { description: args.description }), ...(args.kind && { kind: args.kind }), ...(args.status && { status: args.status }) }), null, 2);
    case "create_task": return JSON.stringify(await context.tasks.createTask(principal, { title: args.title, status: args.status, ...(args.description && { description: args.description }), ...(args.priority !== undefined && { priority: args.priority }), ...(args.dueAt && { dueAt: args.dueAt }), ...(args.projectId && { projectId: args.projectId }), ...(args.goalId && { goalId: args.goalId }) }), null, 2);
    case "update_task": return JSON.stringify(await context.tasks.updateTask(principal, args.taskId, { ...(args.title && { title: args.title }), ...(args.description && { description: args.description }), ...(args.status && { status: args.status }), ...(args.priority !== undefined && { priority: args.priority }), ...(args.dueAt && { dueAt: args.dueAt }) }), null, 2);
    case "create_note": return JSON.stringify(await context.notes.createNote(principal, { content: args.content, ...(args.title && { title: args.title }) }), null, 2);
    case "update_note": return JSON.stringify(await context.notes.updateNote(principal, args.noteId, { ...(args.title && { title: args.title }), ...(args.content && { content: args.content }) }), null, 2);
    case "create_actor": return JSON.stringify(await context.actors.createActor(principal, { type: args.type, name: args.name, ...(args.description && { description: args.description }) }), null, 2);
    case "create_plan": return JSON.stringify(await context.plans.createPlan(principal, { title: args.title, markdown: args.markdown }), null, 2);
    case "update_plan": return JSON.stringify(await context.plans.updatePlan(principal, args.planId, { ...(args.title && { title: args.title }), ...(args.markdown && { markdown: args.markdown }) }), null, 2);
    case "add_goal_to_project": await context.graphOperations.addGoalToProject(principal, args.projectId, args.goalId); return JSON.stringify({ success: true });
    case "add_relationship": return JSON.stringify(await context.graphOperations.addRelationship(principal, args), null, 2);
    case "delete_relationship": await context.graphOperations.deleteRelationship(principal, args.relationshipId); return JSON.stringify({ success: true });
    default: throw new Error(`Unknown tool: ${name}`);
  }
}
