import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { SignJWT, exportJWK, generateKeyPair, type JWK } from "jose";

export interface FakeUser {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  /** false: leave email claims out of the ID token (they are then only in /userinfo). */
  emailInIdToken?: boolean;
}

interface PendingCode {
  clientId: string;
  redirectUri: string;
  nonce?: string;
  codeChallenge?: string;
  user: FakeUser;
}

/**
 * Minimal OpenID Provider for tests: discovery, JWKS, /authorize (302 straight back with
 * code + state for `nextUser`), /token (checks client auth and PKCE, RS256 ID token), /userinfo.
 */
export class FakeOidcProvider {
  issuer = "";
  clientId = "mindsplosion-test";
  clientSecret = "test-client-secret";
  nextUser: FakeUser = { sub: "user-1", email: "user@example.org", email_verified: true, name: "Test User" };
  /** Set to make /authorize answer with ?error=... instead of a code. */
  nextError: string | undefined;
  private server?: Server;
  private privateKey?: CryptoKey;
  private jwk?: JWK;
  private readonly codes = new Map<string, PendingCode>();
  private readonly accessTokens = new Map<string, FakeUser>();

  async start(): Promise<void> {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    this.privateKey = privateKey as CryptoKey;
    this.jwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "RS256", use: "sig" };
    this.server = createServer((req, res) => {
      this.handle(req).then(
        ({ status, headers, body }) => {
          res.writeHead(status, headers);
          res.end(body);
        },
        (error: unknown) => {
          res.writeHead(500, { "content-type": "text/plain" });
          res.end(String(error));
        },
      );
    });
    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
    const { port } = this.server.address() as AddressInfo;
    this.issuer = `http://127.0.0.1:${port}/`; // trailing slash, like authentik
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()) ?? resolve());
  }

  private async handle(req: IncomingMessage): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    const url = new URL(req.url ?? "/", this.issuer);
    const json = (status: number, value: unknown) => ({ status, headers: { "content-type": "application/json" }, body: JSON.stringify(value) });

    if (url.pathname === "/.well-known/openid-configuration") {
      return json(200, {
        issuer: this.issuer,
        authorization_endpoint: this.issuer + "authorize",
        token_endpoint: this.issuer + "token",
        userinfo_endpoint: this.issuer + "userinfo",
        jwks_uri: this.issuer + "jwks",
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["client_secret_basic", "none"],
      });
    }
    if (url.pathname === "/jwks") return json(200, { keys: [this.jwk] });

    if (url.pathname === "/authorize") {
      const p = url.searchParams;
      const redirect = new URL(p.get("redirect_uri") ?? "");
      if (p.get("client_id") !== this.clientId || p.get("response_type") !== "code" || !p.get("scope")?.split(" ").includes("openid")) {
        redirect.searchParams.set("error", "invalid_request");
      } else if (this.nextError) {
        redirect.searchParams.set("error", this.nextError);
      } else {
        const code = randomBytes(16).toString("hex");
        this.codes.set(code, {
          clientId: this.clientId,
          redirectUri: p.get("redirect_uri") ?? "",
          ...(p.get("nonce") ? { nonce: p.get("nonce")! } : {}),
          ...(p.get("code_challenge") ? { codeChallenge: p.get("code_challenge")! } : {}),
          user: this.nextUser,
        });
        redirect.searchParams.set("code", code);
      }
      if (p.get("state")) redirect.searchParams.set("state", p.get("state")!);
      return { status: 302, headers: { location: redirect.href }, body: "" };
    }

    if (url.pathname === "/token" && req.method === "POST") {
      const form = new URLSearchParams(await readBody(req));
      const basic = req.headers.authorization?.startsWith("Basic ")
        ? Buffer.from(req.headers.authorization.slice(6), "base64").toString().split(":").map(decodeURIComponent)
        : undefined;
      if (!basic || basic[0] !== this.clientId || basic[1] !== this.clientSecret) return json(401, { error: "invalid_client" });
      const code = this.codes.get(form.get("code") ?? "");
      this.codes.delete(form.get("code") ?? "");
      if (!code || form.get("grant_type") !== "authorization_code" || form.get("redirect_uri") !== code.redirectUri) return json(400, { error: "invalid_grant" });
      const verifier = form.get("code_verifier") ?? "";
      if (code.codeChallenge && createHash("sha256").update(verifier).digest("base64url") !== code.codeChallenge) return json(400, { error: "invalid_grant" });

      const { user } = code;
      const claims: Record<string, unknown> = { ...(user.name ? { name: user.name } : {}) };
      if (user.emailInIdToken !== false && user.email) {
        claims.email = user.email;
        if (user.email_verified !== undefined) claims.email_verified = user.email_verified;
      }
      if (code.nonce) claims.nonce = code.nonce;
      const idToken = await new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: "test-key" })
        .setIssuer(this.issuer)
        .setSubject(user.sub)
        .setAudience(this.clientId)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(this.privateKey!);
      const accessToken = randomBytes(16).toString("hex");
      this.accessTokens.set(accessToken, user);
      return json(200, { access_token: accessToken, token_type: "Bearer", expires_in: 300, id_token: idToken });
    }

    if (url.pathname === "/userinfo") {
      const user = this.accessTokens.get(req.headers.authorization?.replace(/^Bearer /, "") ?? "");
      if (!user) return json(401, { error: "invalid_token" });
      return json(200, {
        sub: user.sub,
        ...(user.name ? { name: user.name } : {}),
        ...(user.email ? { email: user.email } : {}),
        ...(user.email_verified !== undefined ? { email_verified: user.email_verified } : {}),
      });
    }

    return json(404, { error: "not_found" });
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
