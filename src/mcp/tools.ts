import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Tool, CallToolRequest, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { MindsplosionContext, type RequestPrincipal } from "./context.js";

/**
 * Tool handlers expose domain mutations as MCP tools.
 * Tools represent meaningful state changes or domain operations.
 *
 * Initial tool set focuses on core mutations for Phase 1.
 * Additional tools will be added in later phases.
 */

const TOOLS: Tool[] = [
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
];

export function setupToolHandlers(
  server: Server,
  context: MindsplosionContext,
) {
  // List available tools
  server.setRequestHandler("tools/list", async () => {
    return { tools: TOOLS };
  });

  // Call a tool
  server.setRequestHandler(
    "tools/call",
    async (request: CallToolRequest): Promise<CallToolResult> => {
      const principal = await context.resolvePrincipal(
        request.meta?.clientId || "unknown",
      );

      const { name, arguments: args = {} } = request.params;

      try {
        switch (name) {
          case "create_project": {
            const projectInput = {
              name: args.name as string,
              status: args.status as any,
              ...(args.description ? { description: args.description as string } : {}),
            };
            const project = await context.projects.createProject(principal, projectInput);
            return {
              isError: false,
              content: [
                {
                  type: "text",
                  text: JSON.stringify(project, null, 2),
                },
              ],
            };
          }

          case "create_goal": {
            const goalInput = {
              statement: args.statement as string,
              kind: args.kind as any,
              status: args.status as any,
              ...(args.description ? { description: args.description as string } : {}),
            };
            const goal = await context.goals.createGoal(principal, goalInput);
            return {
              isError: false,
              content: [
                {
                  type: "text",
                  text: JSON.stringify(goal, null, 2),
                },
              ],
            };
          }

          case "create_task": {
            const taskInput = {
              title: args.title as string,
              status: args.status as any,
              ...(args.description ? { description: args.description as string } : {}),
              ...(args.priority ? { priority: args.priority as number } : {}),
              ...(args.dueAt ? { dueAt: args.dueAt as string } : {}),
              ...(args.projectId ? { projectId: args.projectId as string } : {}),
              ...(args.goalId ? { goalId: args.goalId as string } : {}),
            };
            const task = await context.tasks.createTask(principal, taskInput);
            return {
              isError: false,
              content: [
                {
                  type: "text",
                  text: JSON.stringify(task, null, 2),
                },
              ],
            };
          }

          case "create_note": {
            const noteInput = {
              content: args.content as string,
              ...(args.title ? { title: args.title as string } : {}),
            };
            const note = await context.notes.createNote(principal, noteInput);
            return {
              isError: false,
              content: [
                {
                  type: "text",
                  text: JSON.stringify(note, null, 2),
                },
              ],
            };
          }

          default:
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `Unknown tool: ${name}`,
                },
              ],
            };
        }
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
