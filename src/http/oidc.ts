import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import * as client from "openid-client";
import type { PrincipalsRepository } from "../db/principals-repository.js";
import type { Principal } from "../domain/model.js";
import type { OidcConfig } from "./config.js";
import type { AuthorizationServer } from "./oauth/authorization-server.js";
import { safeEqual } from "./oauth/crypto.js";
import { errorPage, sendHtml } from "./pages.js";
import { RateLimiter } from "./rate-limit.js";
import type { HttpAuthStore } from "./store.js";

export const OIDC_COOKIE = "mindsplosion_oidc";
const STATE_TTL_MS = 10 * 60_000;

export interface OidcOptions {
  config: OidcConfig;
  publicUrl: string;
  production: boolean;
  store: HttpAuthStore;
  principals: PrincipalsRepository;
  authorization: AuthorizationServer;
}

export interface OidcClaims {
  sub: string;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  preferred_username?: unknown;
}

export type IdentityResult =
  | { ok: true; principal: Principal }
  | { ok: false; reason: "no_account" | "disabled" };

/**
 * Maps an IdP identity to a Mindsplosion principal:
 * a. existing oidc_identity link (issuer + subject);
 * b. a principal whose email matches a verified email (or any email when OIDC_TRUST_EMAIL), then linked;
 * c. with OIDC_CREATE_USERS a new principal, then linked;
 * d. otherwise no account. Disabled principals are refused.
 */
export async function resolveOidcIdentity(
  issuer: string,
  claims: OidcClaims,
  config: Pick<OidcConfig, "createUsers" | "trustEmail">,
  store: HttpAuthStore,
  principals: PrincipalsRepository,
): Promise<IdentityResult> {
  const check = (principal: Principal | null): IdentityResult | undefined => {
    if (!principal) return undefined;
    return principal.disabledAt ? { ok: false, reason: "disabled" } : { ok: true, principal };
  };

  const linkedId = await store.findIdentity(issuer, claims.sub);
  if (linkedId) {
    const result = check(await principals.findById(linkedId));
    if (result?.ok) await store.touchIdentity(issuer, claims.sub);
    if (result) return result;
  }

  const email = typeof claims.email === "string" && claims.email.includes("@") ? claims.email : undefined;
  const trusted = email !== undefined && (claims.email_verified === true || config.trustEmail);
  if (trusted) {
    const existing = await principals.findByEmail(email);
    const result = check(existing);
    if (result) {
      if (result.ok) await store.linkIdentity(issuer, claims.sub, result.principal.id);
      return result;
    }
  }

  if (config.createUsers) {
    const principal = await principals.create(`oidc:${issuer}#${claims.sub}`, "user", trusted ? email : undefined);
    await store.linkIdentity(issuer, claims.sub, principal.id);
    return { ok: true, principal };
  }

  return { ok: false, reason: "no_account" };
}

function readCookie(request: FastifyRequest, name: string): string | undefined {
  for (const part of (request.headers.cookie ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return undefined;
}

/**
 * OIDC relying party: /oidc/login sends the browser to the IdP, /oidc/callback verifies the
 * result (state cookie, single-use server-side state, PKCE, nonce, ID token) and continues the
 * pending MCP authorization request at its consent page. Only mounted when OIDC_ISSUER is set.
 */
export function mountOidc(app: FastifyInstance, options: OidcOptions): void {
  const { config, publicUrl, production, store, principals, authorization } = options;
  const redirectUri = publicUrl + "/oidc/callback";
  const limiter = new RateLimiter(30, 60_000);

  // Discovery happens on first use; a failed discovery is not cached, so a later request retries.
  let configuration: Promise<client.Configuration> | undefined;
  function discover(): Promise<client.Configuration> {
    if (!configuration) {
      const auth = config.clientSecret ? client.ClientSecretBasic(config.clientSecret) : client.None();
      const insecure = !production && new URL(config.issuer).protocol === "http:";
      configuration = client
        .discovery(new URL(config.issuer), config.clientId, undefined, auth, insecure ? { execute: [client.allowInsecureRequests] } : undefined)
        .catch((error: unknown) => {
          configuration = undefined;
          throw error;
        });
    }
    return configuration;
  }

  const cookie = (value: string, maxAge: number) =>
    `${OIDC_COOKIE}=${encodeURIComponent(value)}; Path=/oidc; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${production ? "; Secure" : ""}`;

  const fail = (reply: FastifyReply, status: number, message: string) =>
    sendHtml(reply, errorPage("Sign-in failed", message), [], status);

  const tooMany = (request: FastifyRequest, reply: FastifyReply) => {
    if (limiter.allow(request.ip)) return undefined;
    return reply.code(429).header("Retry-After", "60").type("text/plain").send("Too many sign-in attempts. Try again in a minute.");
  };

  app.get("/oidc/login", async (request, reply) => {
    const limited = tooMany(request, reply);
    if (limited) return limited;

    const oauth = (request.query as Record<string, string | undefined>).oauth;
    // Mindsplosion has no web UI: sign-in exists only to authorize an MCP client.
    if (!oauth) return fail(reply, 400, "Start the sign-in from your MCP client.");
    try {
      await authorization.validateEncoded(oauth);
    } catch {
      return fail(reply, 400, "Invalid authorization request.");
    }

    let oidc: client.Configuration;
    try {
      oidc = await discover();
    } catch (error) {
      request.log.error({ err: error instanceof Error ? error.message : String(error) }, "OIDC discovery failed");
      return fail(reply, 502, "The sign-in service is not available right now. Try again later.");
    }

    const codeVerifier = client.randomPKCECodeVerifier();
    const state = client.randomState();
    const nonce = client.randomNonce();
    await store.saveLoginState(state, { codeVerifier, nonce, purpose: "oauth", oauthRequest: oauth }, STATE_TTL_MS);

    const url = client.buildAuthorizationUrl(oidc, {
      redirect_uri: redirectUri,
      scope: config.scopes,
      code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: "S256",
      state,
      nonce,
    });
    return reply.header("Set-Cookie", cookie(state, STATE_TTL_MS / 1000)).header("Cache-Control", "no-store").redirect(url.href);
  });

  app.get("/oidc/callback", async (request, reply) => {
    const limited = tooMany(request, reply);
    if (limited) return limited;
    reply.header("Set-Cookie", cookie("", 0));

    const query = request.query as Record<string, string | undefined>;
    const cookieState = readCookie(request, OIDC_COOKIE);
    if (!query.state || !cookieState || !safeEqual(cookieState, query.state)) {
      request.log.warn("OIDC callback refused: state does not match the sign-in cookie");
      return fail(reply, 400, "This sign-in could not be verified. Start again from your MCP client.");
    }

    const pending = await store.consumeLoginState(query.state);
    if (!pending || !pending.oauthRequest) {
      request.log.warn("OIDC callback refused: unknown, expired or already used state");
      return fail(reply, 400, "This sign-in has expired or was already used. Start again from your MCP client.");
    }

    if (query.error) {
      request.log.warn({ oidcError: query.error }, "OIDC provider returned an error");
      return fail(reply, 401, "The identity provider did not complete the sign-in.");
    }

    let claims: OidcClaims;
    try {
      const oidc = await discover();
      const rawQuery = request.url.includes("?") ? request.url.slice(request.url.indexOf("?")) : "";
      const tokens = await client.authorizationCodeGrant(oidc, new URL(redirectUri + rawQuery), {
        pkceCodeVerifier: pending.codeVerifier,
        expectedState: query.state,
        expectedNonce: pending.nonce,
        idTokenExpected: true,
      });
      const idClaims = tokens.claims();
      if (!idClaims) throw new Error("ID token missing");
      claims = { ...idClaims } as OidcClaims;
      if (typeof claims.email !== "string") {
        try {
          const userInfo = await client.fetchUserInfo(oidc, tokens.access_token, idClaims.sub);
          claims = { ...userInfo, ...claims, email: userInfo.email, email_verified: userInfo.email_verified };
        } catch (error) {
          request.log.warn({ err: error instanceof Error ? error.message : String(error) }, "OIDC userinfo request failed");
        }
      }
    } catch (error) {
      request.log.warn({ err: error instanceof Error ? error.message : String(error) }, "OIDC code exchange or ID token validation failed");
      return fail(reply, 401, "The sign-in could not be completed.");
    }

    const identity = await resolveOidcIdentity(config.issuer, claims, config, store, principals);
    if (!identity.ok) {
      request.log.warn({ reason: identity.reason }, "OIDC sign-in refused");
      return fail(reply, 403, identity.reason === "disabled"
        ? "This account is disabled."
        : "No account for this sign-in; ask the administrator.");
    }
    request.log.info({ principalId: identity.principal.id }, "OIDC sign-in");

    const displayName = [claims.name, claims.preferred_username, claims.email]
      .find((v): v is string => typeof v === "string" && v.length > 0)
      ?? identity.principal.email ?? identity.principal.externalSubject;
    try {
      return await authorization.showConsent(reply, pending.oauthRequest, { principalId: identity.principal.id, displayName });
    } catch {
      return fail(reply, 400, "Invalid authorization request.");
    }
  });
}
