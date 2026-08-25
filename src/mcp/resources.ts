import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { MindsplosionContext, type RequestPrincipal } from "./context.js";

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
  server.setRequestHandler("resources/list", async () => {
    const resources = [
      {
        uri: "mindsplosion://projects",
        name: "Projects",
        description: "List all projects accessible to the user",
        mimeType: "application/json" as const,
      },
      {
        uri: "mindsplosion://goals",
        name: "Goals",
        description: "List all goals accessible to the user",
        mimeType: "application/json" as const,
      },
      {
        uri: "mindsplosion://tasks",
        name: "Tasks",
        description: "List all tasks accessible to the user",
        mimeType: "application/json" as const,
      },
      {
        uri: "mindsplosion://notes",
        name: "Notes",
        description: "List all notes accessible to the user",
        mimeType: "application/json" as const,
      },
      {
        uri: "mindsplosion://actors",
        name: "Actors",
        description: "List all actors accessible to the user",
        mimeType: "application/json" as const,
      },
      {
        uri: "mindsplosion://plans",
        name: "Plans",
        description: "List all plans accessible to the user",
        mimeType: "application/json" as const,
      },
    ];

    return { resources };
  });

  // Read a specific resource
  server.setRequestHandler("resources/read", async (request: any) => {
    // For now, extract principal ID from a simple header or context
    const principal = await context.resolvePrincipal("default-principal");
    const uri = request.params.uri as string;

    // Parse resource URI: mindsplosion://type/id
    const match = uri.match(/^mindsplosion:\/\/([^/]+)(?:\/(.+))?$/);
    if (!match) {
      throw new Error(`Invalid resource URI: ${uri}`);
    }

    const [, resourceType, resourceId] = match;

    if (!resourceId) {
      // List resources of a given type
      return await handleListResourceType(
        context,
        principal,
        resourceType,
      );
    } else {
      // Get a specific resource
      return await handleGetResource(
        context,
        principal,
        resourceType,
        resourceId,
      );
    }
  });
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
            mimeType: "application/json" as const,
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
            mimeType: "application/json" as const,
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
            mimeType: "application/json" as const,
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
            mimeType: "application/json" as const,
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
            mimeType: "application/json" as const,
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
            mimeType: "application/json" as const,
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
            mimeType: "application/json" as const,
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
            mimeType: "application/json" as const,
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
            mimeType: "application/json" as const,
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
            mimeType: "application/json" as const,
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
            mimeType: "application/json" as const,
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
            mimeType: "application/json" as const,
            blob: JSON.stringify(plan),
          },
        ],
      };
    }
    default:
      throw new Error(`Unknown resource type: ${resourceType}`);
  }
}
