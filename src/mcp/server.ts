import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { initializeDatabase } from "../db/pool.js";
import { MindsplosionContext, STDIO_PRINCIPAL_SUBJECT } from "./context.js";
import { createMindsplosionServer } from "./create-server.js";

// stdio is a local, single-user transport: every request acts as the fixed
// "default-principal" (created on first use). The HTTP server (src/http/server.ts)
// resolves the principal from the request's access token instead.

async function main() {
  const pool = await initializeDatabase();
  const context = new MindsplosionContext(pool);
  const server = createMindsplosionServer(context, () => context.resolvePrincipal(STDIO_PRINCIPAL_SUBJECT));

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Mindsplosion MCP server connected");
}

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});
