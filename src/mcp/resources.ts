import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListResourcesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { MindsplosionContext, type RequestPrincipal } from "./context.js";
import { buildProjectContext, buildGoalContext, buildTaskContext } from "./context-resources.js";

export function setupResourceHandlers(server: Server, context: MindsplosionContext) {
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      { uri: "mindsplosion://projects", name: "Projects", description: "List all projects accessible to the user", mimeType: "application/json" },
      { uri: "mindsplosion://goals", name: "Goals", description: "List all goals accessible to the user", mimeType: "application/json" },
      { uri: "mindsplosion://tasks", name: "Tasks", description: "List all tasks accessible to the user", mimeType: "application/json" },
      { uri: "mindsplosion://notes", name: "Notes", description: "List all notes accessible to the user", mimeType: "application/json" },
      { uri: "mindsplosion://actors", name: "Actors", description: "List all actors accessible to the user", mimeType: "application/json" },
      { uri: "mindsplosion://plans", name: "Plans", description: "List all plans accessible to the user", mimeType: "application/json" },
      { uri: "mindsplosion://relationships", name: "Relationships", description: "Graph relationships between goals and projects", mimeType: "application/json" },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    const principal = await context.resolvePrincipal("default-principal");
    const match = uri.match(/^mindsplosion:\/\/([^/]+)(?:\/(.+))?$/);
    if (!match) throw new Error(`Invalid resource URI: ${uri}`);
    const [, resourceType = "", resourceId] = match;
    if (!resourceId) return handleListResourceType(context, principal, resourceType);
    const contextMatch = resourceId.match(/^([^/]+)\/context$/);
    if (contextMatch) return handleContextResource(context, principal, resourceType, contextMatch[1]!);
    return handleGetResource(context, principal, resourceType, resourceId);
  });
}

async function handleContextResource(context: MindsplosionContext, principal: RequestPrincipal, resourceType: string, resourceId: string) {
  let value: unknown;
  switch (resourceType) {
    case "projects": value = await buildProjectContext(context, principal, resourceId); break;
    case "goals": value = await buildGoalContext(context, principal, resourceId); break;
    case "tasks": value = await buildTaskContext(context, principal, resourceId); break;
    default: throw new Error(`Context not available for resource type: ${resourceType}`);
  }
  return { contents: [{ uri: `mindsplosion://${resourceType}/${resourceId}/context`, mimeType: "application/json", text: JSON.stringify(value) }] };
}

async function handleListResourceType(context: MindsplosionContext, principal: RequestPrincipal, resourceType: string) {
  let value: unknown;
  switch (resourceType) {
    case "projects": value = await context.projects.listProjects(principal); break;
    case "goals": value = await context.goals.listGoals(principal); break;
    case "tasks": value = await context.tasks.listTasks(principal); break;
    case "notes": value = await context.notes.listNotes(principal); break;
    case "actors": value = await context.actors.listActors(principal); break;
    case "plans": value = await context.plans.listPlans(principal); break;
    case "relationships": value = []; break;
    default: throw new Error(`Unknown resource type: ${resourceType}`);
  }
  return { contents: [{ uri: `mindsplosion://${resourceType}`, mimeType: "application/json", text: JSON.stringify(value) }] };
}

async function handleGetResource(context: MindsplosionContext, principal: RequestPrincipal, resourceType: string, resourceId: string) {
  let value: unknown;
  switch (resourceType) {
    case "projects": value = await context.projects.getProject(principal, resourceId); break;
    case "goals": value = await context.goals.getGoal(principal, resourceId); break;
    case "tasks": value = await context.tasks.getTask(principal, resourceId); break;
    case "notes": value = await context.notes.getNote(principal, resourceId); break;
    case "actors": value = await context.actors.getActor(principal, resourceId); break;
    case "plans": value = await context.plans.getPlan(principal, resourceId); break;
    default: throw new Error(`Unknown resource type: ${resourceType}`);
  }
  if (!value) throw new Error(`Resource not found: ${resourceType}/${resourceId}`);
  return { contents: [{ uri: `mindsplosion://${resourceType}/${resourceId}`, mimeType: "application/json", text: JSON.stringify(value) }] };
}
