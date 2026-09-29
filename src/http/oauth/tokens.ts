import { SignJWT, jwtVerify } from "jose";

export const ACCESS_TOKEN_TTL_SECONDS = 3600;

/** Access token for the MCP resource: HS256 JWT, iss = public URL, aud = `<public URL>/mcp`, sub = principal id. */
export function issueAccessToken(secret: Uint8Array, issuer: string, resource: string, principalId: string, clientId: string, scope: string) {
  return new SignJWT({ client_id: clientId, scope })
    .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
    .setSubject(principalId)
    .setIssuer(issuer)
    .setAudience(resource)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifyAccessToken(secret: Uint8Array, issuer: string, resource: string, token: string) {
  const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"], issuer, audience: resource, typ: "at+jwt" });
  return payload;
}
