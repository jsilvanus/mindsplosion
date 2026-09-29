import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { MindsplosionContext, PrincipalResolver } from "./context.js";
import { readUri } from "./context-resources.js";

const COLLECTIONS: [string, string][] = [
  ["projects", "Projects"],
  ["goals", "Goals"],
  ["tasks", "Tasks"],
  ["notes", "Notes"],
  ["plans", "Plans"],
  ["actors", "Actors"],
  ["schedules", "Schedules"],
  ["alarms", "Alarms"],
  ["labels", "Labels"],
  ["repositories", "Repositories"],
];

export function setupResourceHandlers(server: Server, context: MindsplosionContext, resolvePrincipal: PrincipalResolver) {
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      { uri: "mindsplosion://inbox", name: "Inbox", description: "Ringing alarms, schedules going on now and coming up, overdue and due tasks", mimeType: "application/json" },
      ...COLLECTIONS.map(([collection, name]) => ({
        uri: `mindsplosion://${collection}`,
        name,
        description: `All ${name.toLowerCase()} accessible to you`,
        mimeType: "application/json",
      })),
      { uri: "mindsplosion://relationships", name: "Relationships", description: "Graph relationships between goals and projects", mimeType: "application/json" },
    ],
  }));

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [
      { uriTemplate: "mindsplosion://{collection}/{id}", name: "Item", description: "One item by id (collection: projects, goals, tasks, notes, plans, actors, schedules, alarms, labels, repositories)", mimeType: "application/json" },
      { uriTemplate: "mindsplosion://projects/{id}/context", name: "Project context", description: "A project with its goals, tasks, notes, plans, schedules, alarms, labels, repositories and relationships", mimeType: "application/json" },
      { uriTemplate: "mindsplosion://goals/{id}/context", name: "Goal context", description: "A goal with its projects, actors, tasks, notes, plans, schedules, alarms, labels and relationships", mimeType: "application/json" },
      { uriTemplate: "mindsplosion://tasks/{id}/context", name: "Task context", description: "A task with its project, goal, assignees, notes, plans, schedules, alarms and labels", mimeType: "application/json" },
      { uriTemplate: "mindsplosion://labels/{id}/context", name: "Label context", description: "Everything that carries a label", mimeType: "application/json" },
      { uriTemplate: "mindsplosion://repositories/{id}/context", name: "Repository context", description: "A repository and the projects that use it", mimeType: "application/json" },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    const principal = await resolvePrincipal();
    const value = await readUri(context, principal, uri);
    return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(value) }] };
  });
}
