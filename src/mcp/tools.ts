import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Tool, CallToolRequest, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { MindsplosionContext, type RequestPrincipal } from "./context.js";

/**
 * Tool handlers expose domain mutations as MCP tools.
 * Tools represent meaningful state changes or domain operations.
 *
 * Phase 2+ tools cover core CRUD and semantic domain operations.
 */

const TOOLS: any[] = [
  // Project operations
  {
    name: "create_project",
    description: "Create a new project",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Project name",
        },
        description: {
          type: "string",
          description: "Project description",
        },
        status: {
          type: "string",
          enum: [
            "idea",
            "started",
            "development",
            "blocked",
            "staging",
            "in_production",
            "needs_checking",
            "completed",
            "archived",
          ],
          description: "Project status",
        },
      },
      required: ["name", "status"],
    },
  },
  {
    name: "update_project",
    description: "Update an existing project",
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "Project ID",
        },
        name: {
          type: "string",
          description: "Project name",
        },
        description: {
          type: "string",
          description: "Project description",
        },
        status: {
          type: "string",
          enum: [
            "idea",
            "started",
            "development",
            "blocked",
            "staging",
            "in_production",
            "needs_checking",
            "completed",
            "archived",
          ],
          description: "Project status",
        },
      },
      required: ["projectId"],
    },
  },

  // Goal operations
  {
    name: "create_goal",
    description: "Create a new goal",
    inputSchema: {
      type: "object",
      properties: {
        statement: {
          type: "string",
          description: "Goal statement",
        },
        description: {
          type: "string",
          description: "Goal description",
        },
        kind: {
          type: "string",
          enum: ["determinate", "qualitative"],
          description: "Goal kind",
        },
        status: {
          type: "string",
          enum: ["draft", "active", "paused", "achieved", "abandoned"],
          description: "Goal status",
        },
      },
      required: ["statement", "kind", "status"],
    },
  },
  {
    name: "update_goal",
    description: "Update an existing goal",
    inputSchema: {
      type: "object",
      properties: {
        goalId: {
          type: "string",
          description: "Goal ID",
        },
        statement: {
          type: "string",
          description: "Goal statement",
        },
        description: {
          type: "string",
          description: "Goal description",
        },
        kind: {
          type: "string",
          enum: ["determinate", "qualitative"],
          description: "Goal kind",
        },
        status: {
          type: "string",
          enum: ["draft", "active", "paused", "achieved", "abandoned"],
          description: "Goal status",
        },
      },
      required: ["goalId"],
    },
  },

  // Task operations
  {
    name: "create_task",
    description: "Create a new task",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Task title",
        },
        description: {
          type: "string",
          description: "Task description",
        },
        status: {
          type: "string",
          enum: ["todo", "in_progress", "blocked", "done", "cancelled"],
          description: "Task status",
        },
        priority: {
          type: "number",
          description: "Task priority",
        },
        dueAt: {
          type: "string",
          description: "ISO 8601 due date",
        },
        projectId: {
          type: "string",
          description: "Associated project ID",
        },
        goalId: {
          type: "string",
          description: "Associated goal ID",
        },
      },
      required: ["title", "status"],
    },
  },
  {
    name: "update_task",
    description: "Update an existing task",
    inputSchema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Task ID",
        },
        title: {
          type: "string",
          description: "Task title",
        },
        description: {
          type: "string",
          description: "Task description",
        },
        status: {
          type: "string",
          enum: ["todo", "in_progress", "blocked", "done", "cancelled"],
          description: "Task status",
        },
        priority: {
          type: "number",
          description: "Task priority",
        },
        dueAt: {
          type: "string",
          description: "ISO 8601 due date",
        },
      },
      required: ["taskId"],
    },
  },

  // Note operations
  {
    name: "create_note",
    description: "Create a new note",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Note title",
        },
        content: {
          type: "string",
          description: "Note content",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "update_note",
    description: "Update an existing note",
    inputSchema: {
      type: "object",
      properties: {
        noteId: {
          type: "string",
          description: "Note ID",
        },
        title: {
          type: "string",
          description: "Note title",
        },
        content: {
          type: "string",
          description: "Note content",
        },
      },
      required: ["noteId"],
    },
  },

  // Actor operations
  {
    name: "create_actor",
    description: "Create a new actor (person, team, organization, or agent)",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Actor name",
        },
        type: {
          type: "string",
          enum: ["person", "team", "organization", "agent", "other"],
          description: "Actor type",
        },
        description: {
          type: "string",
          description: "Actor description",
        },
      },
      required: ["name", "type"],
    },
  },

  // Plan operations
  {
    name: "create_plan",
    description: "Create a new plan (markdown document)",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Plan title",
        },
        markdown: {
          type: "string",
          description: "Plan content in Markdown format",
        },
      },
      required: ["title", "markdown"],
    },
  },
  {
    name: "update_plan",
    description: "Update an existing plan",
    inputSchema: {
      type: "object",
      properties: {
        planId: {
          type: "string",
          description: "Plan ID",
        },
        title: {
          type: "string",
          description: "Plan title",
        },
        markdown: {
          type: "string",
          description: "Plan content in Markdown format",
        },
      },
      required: ["planId"],
    },
  },

  // Semantic operations
  {
    name: "add_goal_to_project",
    description: "Add a goal to a project",
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "Project ID",
        },
        goalId: {
          type: "string",
          description: "Goal ID",
        },
      },
      required: ["projectId", "goalId"],
    },
  },

  // Phase 4 — Relationship operations
  {
    name: "add_relationship",
    description: "Create a relationship between two objects",
    inputSchema: {
      type: "object",
      properties: {
        sourceType: {
          type: "string",
          enum: ["goal", "project"],
          description: "Source object type",
        },
        sourceId: {
          type: "string",
          description: "Source object ID",
        },
        targetType: {
          type: "string",
          enum: ["goal", "project"],
          description: "Target object type",
        },
        targetId: {
          type: "string",
          description: "Target object ID",
        },
        type: {
          type: "string",
          enum: [
            "parent_of",
            "depends_on",
            "blocks",
            "enables",
            "helps",
            "hurts",
            "conflicts_with",
            "related_to",
            "derived_from",
            "replaces",
            "distinct_from",
          ],
          description: "Relationship type",
        },
        description: {
          type: "string",
          description: "Optional relationship description",
        },
      },
      required: ["sourceType", "sourceId", "targetType", "targetId", "type"],
    },
  },

  {
    name: "delete_relationship",
    description: "Delete a relationship by ID",
    inputSchema: {
      type: "object",
      properties: {
        relationshipId: {
          type: "string",
          description: "Relationship ID",
        },
      },
      required: ["relationshipId"],
    },
  },
];

export function setupToolHandlers(
  server: Server,
  context: MindsplosionContext,
) {
  // List available tools
  (server.setRequestHandler as any)("tools/list", async () => {
    return { tools: TOOLS };
  });

  // Call a tool
  (server.setRequestHandler as any)(
    "tools/call",
    async (request: CallToolRequest): Promise<CallToolResult> => {
      const principal = await context.resolvePrincipal("default-principal");

      const { name, arguments: args = {} } = request.params;

      try {
        const result = await handleToolCall(context, principal, name, args);
        return {
          isError: false,
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );
}

async function handleToolCall(
  context: MindsplosionContext,
  principal: RequestPrincipal,
  name: string,
  args: any,
): Promise<string> {
  switch (name) {
    // Project operations
    case "create_project": {
      const project = await context.projects.createProject(principal, {
        name: args.name,
        status: args.status,
        ...(args.description && { description: args.description }),
      });
      return JSON.stringify(project, null, 2);
    }

    case "update_project": {
      const project = await context.projects.updateProject(principal, args.projectId, {
        ...(args.name && { name: args.name }),
        ...(args.description && { description: args.description }),
        ...(args.status && { status: args.status }),
      });
      return JSON.stringify(project, null, 2);
    }

    // Goal operations
    case "create_goal": {
      const goal = await context.goals.createGoal(principal, {
        statement: args.statement,
        kind: args.kind,
        status: args.status,
        ...(args.description && { description: args.description }),
      });
      return JSON.stringify(goal, null, 2);
    }

    case "update_goal": {
      const goal = await context.goals.updateGoal(principal, args.goalId, {
        ...(args.statement && { statement: args.statement }),
        ...(args.description && { description: args.description }),
        ...(args.kind && { kind: args.kind }),
        ...(args.status && { status: args.status }),
      });
      return JSON.stringify(goal, null, 2);
    }

    // Task operations
    case "create_task": {
      const task = await context.tasks.createTask(principal, {
        title: args.title,
        status: args.status,
        ...(args.description && { description: args.description }),
        ...(args.priority && { priority: args.priority }),
        ...(args.dueAt && { dueAt: args.dueAt }),
        ...(args.projectId && { projectId: args.projectId }),
        ...(args.goalId && { goalId: args.goalId }),
      });
      return JSON.stringify(task, null, 2);
    }

    case "update_task": {
      const task = await context.tasks.updateTask(principal, args.taskId, {
        ...(args.title && { title: args.title }),
        ...(args.description && { description: args.description }),
        ...(args.status && { status: args.status }),
        ...(args.priority !== undefined && { priority: args.priority }),
        ...(args.dueAt && { dueAt: args.dueAt }),
      });
      return JSON.stringify(task, null, 2);
    }

    // Note operations
    case "create_note": {
      const note = await context.notes.createNote(principal, {
        content: args.content,
        ...(args.title && { title: args.title }),
      });
      return JSON.stringify(note, null, 2);
    }

    case "update_note": {
      const note = await context.notes.updateNote(principal, args.noteId, {
        ...(args.title && { title: args.title }),
        ...(args.content && { content: args.content }),
      });
      return JSON.stringify(note, null, 2);
    }

    // Actor operations
    case "create_actor": {
      const actor = await context.actors.createActor(principal, {
        type: args.type,
        name: args.name,
        ...(args.description && { description: args.description }),
      });
      return JSON.stringify(actor, null, 2);
    }

    // Plan operations
    case "create_plan": {
      const plan = await context.plans.createPlan(principal, {
        title: args.title,
        markdown: args.markdown,
      });
      return JSON.stringify(plan, null, 2);
    }

    case "update_plan": {
      const plan = await context.plans.updatePlan(principal, args.planId, {
        ...(args.title && { title: args.title }),
        ...(args.markdown && { markdown: args.markdown }),
      });
      return JSON.stringify(plan, null, 2);
    }

    // Semantic operations
    case "add_goal_to_project": {
      await context.graphOperations.addGoalToProject(
        principal,
        args.projectId,
        args.goalId,
      );
      return JSON.stringify({ success: true, message: "Goal added to project" });
    }

    // Phase 4 — Relationship operations
    case "add_relationship": {
      const relationship = await context.graphOperations.addRelationship(
        principal,
        {
          sourceType: args.sourceType,
          sourceId: args.sourceId,
          targetType: args.targetType,
          targetId: args.targetId,
          type: args.type,
          ...(args.description && { description: args.description }),
        },
      );
      return JSON.stringify(relationship, null, 2);
    }

    case "delete_relationship": {
      await context.graphOperations.deleteRelationship(
        principal,
        args.relationshipId,
      );
      return JSON.stringify({ success: true, message: "Relationship deleted" });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
