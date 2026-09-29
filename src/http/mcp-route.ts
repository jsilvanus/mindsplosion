import type { IncomingMessage } from "node:http";
import type { FastifyInstance } from "fastify";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { MindsplosionContext, RequestPrincipal } from "../mcp/context.js";
import { createMindsplosionServer } from "../mcp/create-server.js";
import type { StaticTokenConfig } from "./config.js";
import { safeEqual } from "./oauth/crypto.js";
import { verifyAccessToken } from "./oauth/tokens.js";

export interface McpRouteOptions {
  context: MindsplosionContext;
  publicUrl: string;
  /** OAuth resource server settings; absent when only the static token is configured. */
  oauth?: { jwtSecret: Uint8Array; resource: string };
  staticToken?: StaticTokenConfig;
}

export function wwwAuthenticate(publicUrl: string, oauth: boolean, error?: string): string {
  const base = oauth
    ? `Bearer resource_metadata="${publicUrl}/.well-known/oauth-protected-resource/mcp", scope="mcp"`
    : 'Bearer realm="mindsplosion"';
  return base + (error ? `, error="${error}", error_description="The access token is missing, expired or invalid."` : "");
}

const methodNotAllowed = { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null };

/**
 * Streamable HTTP MCP endpoint, stateless: a new MCP server and transport per request.
 * Every request needs a valid bearer token (OAuth access token or the static token);
 * the principal comes from the token, never from tool arguments.
 */
export function mountMcpRoute(app: FastifyInstance, options: McpRouteOptions): void {
  const { context, publicUrl } = options;

  async function authenticate(token: string): Promise<RequestPrincipal | undefined> {
    if (options.staticToken && safeEqual(token, options.staticToken.token)) {
      const principal = await context.resolvePrincipal(options.staticToken.subject);
      const record = await context.principals.findById(principal.principalId);
      return record && !record.disabledAt ? principal : undefined;
    }
    if (options.oauth) {
      let principalId: string;
      try {
        const payload = await verifyAccessToken(options.oauth.jwtSecret, publicUrl, options.oauth.resource, token);
        if (typeof payload.sub !== "string") return undefined;
        principalId = payload.sub;
      } catch {
        return undefined;
      }
      const record = await context.principals.findById(principalId);
      return record && !record.disabledAt ? { principalId: record.id, externalSubject: record.externalSubject } : undefined;
    }
    return undefined;
  }

  app.post("/mcp", async (request, reply) => {
    const challenge = (error?: string) =>
      reply.code(401).header("WWW-Authenticate", wwwAuthenticate(publicUrl, Boolean(options.oauth), error)).send({ error: error ?? "unauthorized" });

    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) return challenge();
    const token = header.slice("Bearer ".length).trim();
    // An invalid token is never treated as anonymous: the client must refresh or re-authorize.
    const principal = token ? await authenticate(token) : undefined;
    if (!principal) return challenge("invalid_token");

    const server = createMindsplosionServer(context, async () => principal);
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true }) // no sessionIdGenerator = stateless;
    await server.connect(transport as unknown as Transport);

    reply.hijack();
    reply.raw.on("close", () => {
      transport.close().catch(() => undefined);
      server.close().catch(() => undefined);
    });

    const raw = request.raw as IncomingMessage & { auth?: AuthInfo };
    raw.auth = { token, clientId: "mindsplosion", scopes: ["mcp"], extra: { principalId: principal.principalId } };
    await transport.handleRequest(raw, reply.raw, request.body);
  });

  app.head("/mcp", async (_request, reply) => reply.code(200).send());
  app.get("/mcp", async (_request, reply) => reply.code(405).header("Allow", "POST").send(methodNotAllowed));
  app.delete("/mcp", async (_request, reply) => reply.code(405).header("Allow", "POST").send(methodNotAllowed));
}
