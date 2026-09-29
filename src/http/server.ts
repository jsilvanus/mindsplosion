import { initializeDatabase } from "../db/pool.js";
import { buildHttpApp } from "./app.js";
import { ConfigError, loadHttpConfig } from "./config.js";

// Entry point of the Streamable HTTP MCP server (`pnpm http`, or `node dist/http/server.js`).
// The stdio server (src/mcp/server.ts) is unchanged and independent of this one.

async function main() {
  const config = loadHttpConfig();
  const db = await initializeDatabase();
  const app = await buildHttpApp({ config, db });
  await app.listen({ host: config.host, port: config.port });
  app.log.info(
    { publicUrl: config.publicUrl, oauth: Boolean(config.oauth), staticToken: Boolean(config.staticToken) },
    "Mindsplosion HTTP MCP server listening",
  );
}

main().catch((error) => {
  console.error(error instanceof ConfigError ? `Configuration error: ${error.message}` : error);
  process.exit(1);
});
