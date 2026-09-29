import type { FastifyInstance } from "fastify";

/** OAuth discovery (RFC 8414 / RFC 9728), as in the codestash api-connector-style scaffold. */
export function mountOAuthMetadata(app: FastifyInstance, publicUrl: string): void {
  const metadata = {
    issuer: publicUrl,
    authorization_endpoint: publicUrl + "/oauth/authorize",
    token_endpoint: publicUrl + "/oauth/token",
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };

  const protectedResource = {
    resource: publicUrl + "/mcp",
    authorization_servers: [publicUrl],
    scopes_supported: ["mcp"],
    bearer_methods_supported: ["header"],
  };
  // RFC 9728: the metadata of resource <publicUrl>/mcp lives at the path-inserted URL; the root URL is kept for older clients.
  app.get("/.well-known/oauth-protected-resource/mcp", async () => protectedResource);
  app.get("/.well-known/oauth-protected-resource", async () => protectedResource);
  app.get("/.well-known/oauth-authorization-server", async () => metadata);
  // Interoperability alias only: this server is not an OpenID Provider (no jwks_uri, no ID tokens).
  app.get("/.well-known/openid-configuration", async () => metadata);
}
