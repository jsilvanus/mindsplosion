import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { MindsplosionContext, type RequestPrincipal } from "./context.js";
import {
  buildProjectContext,
  buildGoalContext,
  buildTaskContext,
} from "./context-resources.js";

/**
 * Resource handlers expose Mindsplosion domain objects through MCP's resource interface.
 * Resources are the primary surface for MCP clients to read domain data.
 *
 * Resource URI scheme: mindsplosion://type/id
 * Examples:
 *   - mindsplosion://projects/abc123
 *   - mindsplosion://goals/def456
 *   - mindsplosion://tasks/ghi789
 */

export function setupResourceHandlers(
  server: Server,
  context: MindsplosionContext,
) {
  // List all available resources (discovery)
  (server.setRequestHandler as any)("resources/list", async () => {
    const resources: any[] = [
      {
        uri: "mindsplosion://projects",
        name: "Projects",
        description: "List all projects accessible to the user",
        mimeType: "application/json",
      },
      {
        uri: "mindsplosion://goals",
        name: "Goals",
        description: "List all goals accessible to the user",
        mimeType: "application/json",
      },
      {
        uri: "mindsplosion://tasks",
        name: "Tasks",
        description: "List all tasks accessible to the user",
        mimeType: "application/json",
      },
      {
        uri: "mindsplosion://notes",
        name: "Notes",
        description: "List all notes accessible to the user",
        mimeType: "application/json",
      },
      {
        uri: "mindsplosion://actors",
        name: "Actors",
        description: "List all actors accessible to the user",
        mimeType: "application/json",
      },
      {
        uri: "mindsplosion://plans",
        name: "Plans",
        description: "List all plans accessible to the user",
        mimeType: "application/json",
      },
    ];

    return { resources };
  });

  // Read a specific resource
  (server.setRequestHandler as any)("resources/read", async (request: any) => {
    try {
      const uri = request.params.uri as string;
      const principal = await context.resolvePrincipal("default-principal");

      // Parse resource URI: mindsplosion://type/id
      const match = uri.match(/^mindsplosion:\/\/([^/]+)(?:\/(.+))?$/);
      if (!match) {
        throw new Error(`Invalid resource URI: ${uri}`);
      }

      const [, resourceType = "", resourceId] = match;

      if (!resourceId) {
        // List resources of a given type
        return await handleListResourceType(
          context,
          principal,
          resourceType as string,
        );
      } else {
        // Check if this is a context resource (e.g., projects/abc/context)
        const contextMatch = resourceId.match(/^([^/]+)\/context$/);
        if (contextMatch) {
          const [, actualId] = contextMatch;
          return await handleContextResource(
            context,
            principal,
            resourceType as string,
            actualId as string,
          );
        }

        // Get a specific resource
        return await handleGetResource(
          context,
          principal,
          resourceType as string,
          resourceId as string,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Return error in MCP format
      if (message.includes("not found") || message.includes("Unknown")) {
        throw new Error(`Resource not found or not accessible`);
      }
      throw error;
    }
  });
}

async function handleContextResource(
  context: MindsplosionContext,
  principal: RequestPrincipal,
  resourceType: string,
  resourceId: string,
): Promise<any> {
  switch (resourceType) {
    case "projects": {
      const ctx = await buildProjectContext(context, principal, resourceId);
      return {
        contents: [
          {
            uri: `mindsplosion://projects/${resourceId}/context`,
            mimeType: "application/json",
            blob: JSON.stringify(ctx),
          },
        ],
      };
    }
    case "goals": {
      const ctx = await buildGoalContext(context, principal, resourceId);
      return {
        contents: [
          {
            uri: `mindsplosion://goals/${resourceId}/context`,
            mimeType: "application/json",
            blob: JSON.stringify(ctx),
          },
        ],
      };
    }
    case "tasks": {
      const ctx = await buildTaskContext(context, principal, resourceId);
      return {
        contents: [
          {
            uri: `mindsplosion://tasks/${resourceId}/context`,
            mimeType: "application/json",
            blob: JSON.stringify(ctx),
          },
        ],
      };
    }
    default:
      throw new Error(`Context not available for resource type: ${resourceType}`);
  }
}

async function handleListResourceType(
  context: MindsplosionContext,
  principal: RequestPrincipal,
  resourceType: string,
): Promise<any> {
  switch (resourceType) {
    case "projects": {
      const projects = await context.projects.listProjects(principal);
      return {
        contents: [
          {
            uri: `mindsplosion://projects`,
            mimeType: "application/json",
            blob: JSON.stringify(projects),
          },
        ],
      };
    }
    case "goals": {
      const goals = await context.goals.listGoals(principal);
      return {
        contents: [
          {
            uri: `mindsplosion://goals`,
            mimeType: "application/json",
            blob: JSON.stringify(goals),
          },
        ],
      };
    }
    case "tasks": {
      const tasks = await context.tasks.listTasks(principal);
      return {
        contents: [
          {
            uri: `mindsplosion://tasks`,
            mimeType: "application/json",
            blob: JSON.stringify(tasks),
          },
        ],
      };
    }
    case "notes": {
      const notes = await context.notes.listNotes(principal);
      return {
        contents: [
          {
            uri: `mindsplosion://notes`,
            mimeType: "application/json",
            blob: JSON.stringify(notes),
          },
        ],
      };
    }
    case "actors": {
      const actors = await context.actors.listActors(principal);
      return {
        contents: [
          {
            uri: `mindsplosion://actors`,
            mimeType: "application/json",
            blob: JSON.stringify(actors),
          },
        ],
      };
    }
    case "plans": {
      const plans = await context.plans.listPlans(principal);
      return {
        contents: [
          {
            uri: `mindsplosion://plans`,
            mimeType: "application/json",
            blob: JSON.stringify(plans),
          },
        ],
      };
    }
    default:
      throw new Error(`Unknown resource type: ${resourceType}`);
  }
}

async function handleGetResource(
  context: MindsplosionContext,
  principal: RequestPrincipal,
  resourceType: string,
  resourceId: string,
): Promise<any> {
  switch (resourceType) {
    case "projects": {
      const project = await context.projects.getProject(principal, resourceId);
      if (!project) throw new Error(`Project not found: ${resourceId}`);
      return {
        contents: [
          {
            uri: `mindsplosion://projects/${resourceId}`,
            mimeType: "application/json",
            blob: JSON.stringify(project),
          },
        ],
      };
    }
    case "goals": {
      const goal = await context.goals.getGoal(principal, resourceId);
      if (!goal) throw new Error(`Goal not found: ${resourceId}`);
      return {
        contents: [
          {
            uri: `mindsplosion://goals/${resourceId}`,
            mimeType: "application/json",
            blob: JSON.stringify(goal),
          },
        ],
      };
    }
    case "tasks": {
      const task = await context.tasks.getTask(principal, resourceId);
      if (!task) throw new Error(`Task not found: ${resourceId}`);
      return {
        contents: [
          {
            uri: `mindsplosion://tasks/${resourceId}`,
            mimeType: "application/json",
            blob: JSON.stringify(task),
          },
        ],
      };
    }
    case "notes": {
      const note = await context.notes.getNote(principal, resourceId);
      if (!note) throw new Error(`Note not found: ${resourceId}`);
      return {
        contents: [
          {
            uri: `mindsplosion://notes/${resourceId}`,
            mimeType: "application/json",
            blob: JSON.stringify(note),
          },
        ],
      };
    }
    case "actors": {
      const actor = await context.actors.getActor(principal, resourceId);
      if (!actor) throw new Error(`Actor not found: ${resourceId}`);
      return {
        contents: [
          {
            uri: `mindsplosion://actors/${resourceId}`,
            mimeType: "application/json",
            blob: JSON.stringify(actor),
          },
        ],
      };
    }
    case "plans": {
      const plan = await context.plans.getPlan(principal, resourceId);
      if (!plan) throw new Error(`Plan not found: ${resourceId}`);
      return {
        contents: [
          {
            uri: `mindsplosion://plans/${resourceId}`,
            mimeType: "application/json",
            blob: JSON.stringify(plan),
          },
        ],
      };
    }
    default:
      throw new Error(`Unknown resource type: ${resourceType}`);
  }
}
