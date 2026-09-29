import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { MindsplosionContext, PrincipalResolver } from "./context.js";
import { setupResourceHandlers } from "./resources.js";
import { setupToolHandlers } from "./tools.js";

/**
 * Builds the Mindsplosion MCP server. The transport decides who the caller is:
 * stdio always acts as the fixed local principal, HTTP as the access token's principal.
 */
export function createMindsplosionServer(context: MindsplosionContext, resolvePrincipal: PrincipalResolver): Server {
  const server = new Server(
    {
      name: "mindsplosion",
      version: "1.0.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    },
  );
  setupResourceHandlers(server, context, resolvePrincipal);
  setupToolHandlers(server, context, resolvePrincipal);
  return server;
}
