import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  StdioServerTransport,
} from "@modelcontextprotocol/sdk/server/stdio.js";
import type {
  Tool,
  TextContent,
  ResourceContents,
} from "@modelcontextprotocol/sdk/types.js";
import { initializeDatabase } from "../db/pool.js";
import { MindsplosionContext } from "./context.js";
import { setupResourceHandlers } from "./resources.js";
import { setupToolHandlers } from "./tools.js";

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

async function main() {
  const pool = await initializeDatabase();
  const context = new MindsplosionContext(pool);

  setupResourceHandlers(server, context);
  setupToolHandlers(server, context);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Mindsplosion MCP server connected");
}

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});
