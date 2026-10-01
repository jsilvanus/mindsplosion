import Fastify, { type FastifyInstance } from "fastify";
import formbody from "@fastify/formbody";
import type { Db } from "../db/pool.js";
import { MindsplosionContext } from "../mcp/context.js";
import type { HttpConfig } from "./config.js";
import { mountMcpRoute } from "./mcp-route.js";
import { mountAuthorizationServer, type CimdMetadata } from "./oauth/authorization-server.js";
import { mountOAuthMetadata } from "./oauth/metadata.js";
import { mountOidc } from "./oidc.js";
import { HttpAuthStore } from "./store.js";

export interface HttpAppOptions {
  config: HttpConfig;
  db: Db;
  logger?: boolean;
  /** Replaces the CIMD fetch (tests). */
  fetchClientMetadata?: (clientId: string) => Promise<CimdMetadata>;
}

/**
 * Assembles the HTTP MCP server without listening. OAuth discovery and the authorization server
 * exist only when OAuth is configured (JWT_SECRET), the OIDC routes only when OIDC_ISSUER is set.
 */
export async function buildHttpApp(options: HttpAppOptions): Promise<FastifyInstance> {
  const { config, db } = options;
  const app = Fastify({
    logger: options.logger ?? true,
    ...(config.trustProxy !== undefined ? { trustProxy: config.trustProxy } : {}),
  });
  await app.register(formbody);

  const context = new MindsplosionContext(db);
  const resource = config.publicUrl + "/mcp";

  if (config.oauth) {
    const store = new HttpAuthStore(db);
    mountOAuthMetadata(app, config.publicUrl);
    const authorization = mountAuthorizationServer(app, {
      issuer: config.publicUrl,
      resource,
      secret: config.oauth.jwtSecret,
      store,
      principals: context.principals,
      signIn: { password: config.oauth.passwordLogin, ...(config.oauth.oidc ? { ssoLabel: config.oauth.oidc.buttonLabel } : {}) },
      ...(options.fetchClientMetadata ? { fetchClientMetadata: options.fetchClientMetadata } : {}),
    });
    if (config.oauth.oidc) {
      mountOidc(app, {
        config: config.oauth.oidc,
        publicUrl: config.publicUrl,
        production: config.production,
        store,
        principals: context.principals,
        authorization,
      });
    }
  }

  mountMcpRoute(app, {
    context,
    publicUrl: config.publicUrl,
    ...(config.oauth ? { oauth: { jwtSecret: config.oauth.jwtSecret, resource } } : {}),
    ...(config.staticToken ? { staticToken: config.staticToken } : {}),
  });

  app.get("/health", { logLevel: "silent" }, async () => ({ ok: true }));
  return app;
}
