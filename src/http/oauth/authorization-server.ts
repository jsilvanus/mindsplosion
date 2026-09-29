import type { FastifyInstance, FastifyReply } from "fastify";
import { SignJWT, jwtVerify } from "jose";
import type { PrincipalsRepository } from "../../db/principals-repository.js";
import type { HttpAuthStore } from "../store.js";
import { escapeHtml, page, sendHtml } from "../pages.js";
import { dummyPasswordHash, verifyPassword } from "../password.js";
import { RateLimiter } from "../rate-limit.js";
import { fetchCimdMetadata, isCimdClientId, type CimdMetadata } from "./cimd.js";
import { redirectSource } from "./csp.js";
import { randomToken, sha256, verifyS256 } from "./crypto.js";
import { ACCESS_TOKEN_TTL_SECONDS, issueAccessToken } from "./tokens.js";

export type { CimdMetadata };

type OAuthQuery = Record<string, string | undefined>;

export interface AuthorizationServerOptions {
  issuer: string;
  resource: string;
  secret: Uint8Array;
  store: HttpAuthStore;
  principals: PrincipalsRepository;
  /** Sign-in methods on the sign-in page: built-in password and/or a single sign-on button (label). */
  signIn: { password: boolean; ssoLabel?: string };
  /** Resolves a CIMD client_id to its metadata. Replaceable in tests. */
  fetchClientMetadata?: (clientId: string) => Promise<CimdMetadata>;
}

export interface SignedInPrincipal {
  principalId: string;
  displayName: string;
}

export interface AuthorizationServer {
  /** Decodes and re-validates an encoded authorization request exactly as /oauth/authorize does. Throws if invalid. */
  validateEncoded(oauth: string): Promise<{ query: OAuthQuery; metadata: CimdMetadata }>;
  /** Continues an authorization request after a successful sign-in: the consent page. */
  showConsent(reply: FastifyReply, oauth: string, principal: SignedInPrincipal): Promise<FastifyReply>;
}

const LOGIN_TICKET_TTL = "10m";
const CODE_TTL_MS = 60_000;
const REFRESH_TTL_MS = 30 * 86_400_000;

export function encodeOAuth(query: OAuthQuery): string {
  const entries = Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === "string");
  return Buffer.from(new URLSearchParams(entries).toString()).toString("base64url");
}

function decodeOAuth(value: string): OAuthQuery {
  return Object.fromEntries(new URLSearchParams(Buffer.from(value, "base64url").toString("utf8")));
}

const invalidRequest = (reply: FastifyReply) =>
  sendHtml(reply, page("Invalid request", "<h1>Invalid authorization request</h1>"), [], 400);

/**
 * Embedded OAuth authorization server for MCP clients (CIMD client ids, S256 PKCE, refresh tokens).
 * Users sign in with a password set by the administrator (POST /oauth/login) and/or through
 * OIDC (src/http/oidc.ts); both continue at the same consent page.
 */
export function mountAuthorizationServer(app: FastifyInstance, options: AuthorizationServerOptions): AuthorizationServer {
  const { issuer, resource, secret, store, principals } = options;
  const fetchClientMetadata = options.fetchClientMetadata ?? fetchCimdMetadata;
  const ticketAudience = issuer + "/oauth/authorize";
  const loginLimiter = new RateLimiter(10, 60_000);

  async function validateRequest(query: OAuthQuery): Promise<CimdMetadata> {
    if (query.response_type !== "code" || !query.client_id || !query.redirect_uri || !query.code_challenge || query.code_challenge_method !== "S256") {
      throw new Error("Invalid OAuth request");
    }
    if (query.resource !== undefined && query.resource !== resource) throw new Error("Invalid resource");
    if (!isCimdClientId(query.client_id)) throw new Error("Invalid client_id");
    const metadata = await fetchClientMetadata(query.client_id);
    if (!metadata.redirect_uris.includes(query.redirect_uri)) throw new Error("Invalid redirect_uri");
    return metadata;
  }

  async function validateEncoded(oauth: string) {
    const query = decodeOAuth(oauth);
    return { query, metadata: await validateRequest(query) };
  }

  async function activePrincipal(id: string) {
    const principal = await principals.findById(id);
    return principal && !principal.disabledAt ? principal : undefined;
  }

  /** Signed, short-lived proof that the user signed in for this authorization request (see README, "consent ticket"). */
  function issueLoginTicket(principalId: string, oauth: string): Promise<string> {
    return new SignJWT({ typ: "login", oauth: sha256(oauth) })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(principalId)
      .setIssuer(issuer)
      .setAudience(ticketAudience)
      .setIssuedAt()
      .setExpirationTime(LOGIN_TICKET_TTL)
      .sign(secret);
  }

  async function verifyLoginTicket(ticket: string, oauth: string): Promise<string | undefined> {
    try {
      const { payload } = await jwtVerify(ticket, secret, { algorithms: ["HS256"], issuer, audience: ticketAudience });
      if (payload.typ !== "login" || payload.oauth !== sha256(oauth) || typeof payload.sub !== "string") return undefined;
      return (await activePrincipal(payload.sub))?.id;
    } catch {
      return undefined;
    }
  }

  function signInPage(oauth: string, clientName: string, error?: string, login = ""): string {
    const { password, ssoLabel } = options.signIn;
    return page("Sign in to Mindsplosion",
      `<h1>Sign in</h1><p><strong>${escapeHtml(clientName)}</strong> wants to connect to Mindsplosion. Sign in to continue.</p>` +
      (error ? `<p class="error">${escapeHtml(error)}</p>` : "") +
      (ssoLabel ? `<a class="button" href="/oidc/login?oauth=${encodeURIComponent(oauth)}">${escapeHtml(ssoLabel)}</a>` : "") +
      (ssoLabel && password ? "<p>or with your password</p>" : "") +
      (password
        ? '<form method="post" action="/oauth/login">' +
          `<input type="hidden" name="oauth" value="${escapeHtml(oauth)}">` +
          `<label for="login">Email or username</label><input id="login" name="login" autocomplete="username" required value="${escapeHtml(login)}">` +
          '<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>' +
          '<button type="submit">Sign in</button></form>'
        : ""));
  }

  async function showConsent(reply: FastifyReply, oauth: string, principal: SignedInPrincipal) {
    const { query, metadata } = await validateEncoded(oauth);
    const ticket = await issueLoginTicket(principal.principalId, oauth);
    const html = page("Authorize MCP client",
      `<h1>Authorize MCP client</h1><p><strong>${escapeHtml(metadata.client_name ?? query.client_id!)}</strong> wants access to your Mindsplosion data as <strong>${escapeHtml(principal.displayName)}</strong>.</p>` +
      '<form method="post" action="/oauth/authorize">' +
      `<input type="hidden" name="oauth" value="${escapeHtml(oauth)}">` +
      `<input type="hidden" name="ticket" value="${escapeHtml(ticket)}">` +
      '<button type="submit" name="action" value="approve">Approve</button>' +
      '<button class="secondary" type="submit" name="action" value="deny">Deny</button></form>');
    // Approve/deny redirect to the client: form-action must allow its redirect_uri, or browsers block the redirect.
    return sendHtml(reply, html, [redirectSource(query.redirect_uri!)]);
  }

  app.get("/oauth/authorize", async (request, reply) => {
    const query = request.query as OAuthQuery;
    let metadata: CimdMetadata;
    try {
      metadata = await validateRequest(query);
    } catch {
      return invalidRequest(reply);
    }
    return sendHtml(reply, signInPage(encodeOAuth(query), metadata.client_name ?? query.client_id!));
  });

  if (options.signIn.password) {
    // Built-in sign-in: the principal's email or external subject, and the password set with
    // `pnpm principal set-password`. Unknown names cost the same scrypt work as wrong passwords.
    app.post("/oauth/login", async (request, reply) => {
      const body = (request.body ?? {}) as OAuthQuery;
      if (!body.oauth) return invalidRequest(reply);
      let query: OAuthQuery;
      let metadata: CimdMetadata;
      try {
        ({ query, metadata } = await validateEncoded(body.oauth));
      } catch {
        return invalidRequest(reply);
      }
      const clientName = metadata.client_name ?? query.client_id!;
      if (!loginLimiter.allow(request.ip)) {
        return sendHtml(reply, signInPage(body.oauth, clientName, "Too many sign-in attempts. Try again in a minute."), [], 429);
      }
      const login = (body.login ?? "").trim();
      if (!login || !body.password) return sendHtml(reply, signInPage(body.oauth, clientName, "Enter your email or username and password.", login), [], 400);

      const account = await principals.findForLogin(login);
      const valid = await verifyPassword(account?.passwordHash ?? (await dummyPasswordHash()), body.password);
      if (!account?.passwordHash || !valid || account.principal.disabledAt) {
        request.log.warn("Password sign-in refused");
        return sendHtml(reply, signInPage(body.oauth, clientName, "Invalid email, username or password.", login), [], 401);
      }
      request.log.info({ principalId: account.principal.id }, "Password sign-in");
      return showConsent(reply, body.oauth, {
        principalId: account.principal.id,
        displayName: account.principal.email ?? account.principal.externalSubject,
      });
    });
  }

  // Consent decision, authenticated by the login ticket issued after the password or OIDC sign-in.
  app.post("/oauth/authorize", async (request, reply) => {
    const body = (request.body ?? {}) as OAuthQuery;
    if (!body.oauth) return invalidRequest(reply);
    const oauth = body.oauth;

    let query: OAuthQuery;
    let metadata: CimdMetadata;
    try {
      ({ query, metadata } = await validateEncoded(oauth));
    } catch {
      return invalidRequest(reply);
    }

    const principalId = body.ticket ? await verifyLoginTicket(body.ticket, oauth) : undefined;
    if (!principalId || (body.action !== "approve" && body.action !== "deny")) {
      return sendHtml(reply, signInPage(oauth, metadata.client_name ?? query.client_id!, "Your sign-in has expired. Please sign in again."), [], 401);
    }

    const target = new URL(query.redirect_uri!);
    if (body.action === "deny") {
      target.searchParams.set("error", "access_denied");
    } else {
      const code = randomToken();
      await store.saveAuthorizationCode(code, {
        clientId: query.client_id!,
        redirectUri: query.redirect_uri!,
        codeChallenge: query.code_challenge!,
        principalId,
        scope: query.scope ?? "mcp",
      }, CODE_TTL_MS);
      target.searchParams.set("code", code);
    }
    target.searchParams.set("iss", issuer);
    if (query.state) target.searchParams.set("state", query.state);
    return reply.redirect(target.toString());
  });

  app.post("/oauth/token", async (request, reply) => {
    const body = (request.body ?? {}) as OAuthQuery;
    reply.header("Cache-Control", "no-store"); // RFC 6749 §5.1
    const invalidGrant = () => reply.code(400).send({ error: "invalid_grant" });

    if (body.resource !== undefined && body.resource !== resource) return reply.code(400).send({ error: "invalid_target" });

    if (body.grant_type === "authorization_code") {
      const code = body.code ? await store.consumeAuthorizationCode(body.code) : undefined;
      if (!code || body.client_id !== code.clientId || body.redirect_uri !== code.redirectUri || !body.code_verifier || !verifyS256(body.code_verifier, code.codeChallenge)) {
        return invalidGrant();
      }
      if (!(await activePrincipal(code.principalId))) return invalidGrant();
      const accessToken = await issueAccessToken(secret, issuer, resource, code.principalId, code.clientId, code.scope);
      const refreshToken = randomToken();
      await store.saveRefreshToken(refreshToken, { clientId: code.clientId, principalId: code.principalId, scope: code.scope }, REFRESH_TTL_MS);
      return { access_token: accessToken, token_type: "Bearer", expires_in: ACCESS_TOKEN_TTL_SECONDS, refresh_token: refreshToken, scope: code.scope };
    }

    if (body.grant_type === "refresh_token") {
      const refresh = body.refresh_token ? await store.getRefreshToken(body.refresh_token) : undefined;
      if (!refresh || body.client_id !== refresh.clientId) return invalidGrant();
      // A deleted or disabled principal keeps no access through old refresh tokens.
      if (!(await activePrincipal(refresh.principalId))) return invalidGrant();
      const accessToken = await issueAccessToken(secret, issuer, resource, refresh.principalId, refresh.clientId, refresh.scope);
      return { access_token: accessToken, token_type: "Bearer", expires_in: ACCESS_TOKEN_TTL_SECONDS, scope: refresh.scope };
    }

    return reply.code(400).send({ error: "unsupported_grant_type" });
  });

  return { validateEncoded, showConsent };
}
