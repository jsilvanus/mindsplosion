import { initializeDatabase } from "../db/pool.js";
import { PrincipalsRepository } from "../db/principals-repository.js";
import { buildHttpApp } from "./app.js";
import { ConfigError, loadHttpConfig } from "./config.js";
import { loadDotEnv } from "../env.js";

// Entry point of the Streamable HTTP MCP server (`pnpm http`, or `node dist/http/server.js`).
// The stdio server (src/mcp/server.ts) is unchanged and independent of this one.

async function main() {
  loadDotEnv();
  const config = loadHttpConfig();
  const db = await initializeDatabase();
  const app = await buildHttpApp({ config, db });
  if (config.oauth?.passwordLogin && (await new PrincipalsRepository(db).countWithPassword()) === 0) {
    app.log.warn("Password sign-in is on but no account has a password yet: run `pnpm principal set-password default-principal` (in Docker: `docker compose exec -it mindsplosion node dist/cli/principal.js set-password default-principal`)");
  }
  await app.listen({ host: config.host, port: config.port });
  app.log.info(
    { publicUrl: config.publicUrl, oauth: Boolean(config.oauth), passwordLogin: Boolean(config.oauth?.passwordLogin), oidc: Boolean(config.oauth?.oidc), staticToken: Boolean(config.staticToken) },
    "Mindsplosion HTTP MCP server listening",
  );
}

main().catch((error) => {
  console.error(error instanceof ConfigError ? `Configuration error: ${error.message}` : error);
  process.exit(1);
});
