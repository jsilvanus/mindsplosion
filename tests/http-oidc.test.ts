import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { createPool, type Db } from "../src/db/pool.js";
import { PrincipalsRepository } from "../src/db/principals-repository.js";
import { buildHttpApp } from "../src/http/app.js";
import { ConfigError, loadHttpConfig } from "../src/http/config.js";
import { OIDC_COOKIE } from "../src/http/oidc.js";
import { FakeOidcProvider, type FakeUser } from "./helpers/fake-oidc.js";

const PUBLIC_URL = "http://mindsplosion.test";
const CLIENT_ID = "https://client.example/oauth/client.json";
const CLIENT_REDIRECT = "https://client.example/callback";
const STATIC_TOKEN = "static-token-" + "x".repeat(40);
const JWT_SECRET = randomBytes(32).toString("base64");

// Runs on a temporary SQLite file; set MINDSPLOSION_TEST_DATABASE_URL to a migrated PostgreSQL
// database (it is truncated) to run the same tests on PostgreSQL.
const PG_URL = process.env.MINDSPLOSION_TEST_DATABASE_URL;

const idp = new FakeOidcProvider();
let dir: string;
let db: Db;
let principals: PrincipalsRepository;
let app: FastifyInstance | undefined;
let base: string;

beforeAll(async () => {
  await idp.start();
});
afterAll(async () => {
  await idp.stop();
});

afterEach(async () => {
  await stop();
});

async function stop(): Promise<void> {
  await app?.close();
  app = undefined;
  await (db as unknown as { end?: () => Promise<void> } | undefined)?.end?.();
  if (dir) rmSync(dir, { recursive: true, force: true });
}

function oidcEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: "test",
    MCP_PUBLIC_URL: PUBLIC_URL,
    OIDC_ISSUER: idp.issuer,
    OIDC_CLIENT_ID: idp.clientId,
    OIDC_CLIENT_SECRET: idp.clientSecret,
    OIDC_BUTTON_LABEL: "Sign in with Authentik",
    JWT_SECRET,
    ...extra,
  };
}

async function start(env: Record<string, string>): Promise<void> {
  dir = mkdtempSync(join(tmpdir(), "mindsplosion-http-"));
  db = createPool(PG_URL ?? join(dir, "test.sqlite"));
  if (PG_URL) await db.query("TRUNCATE principal, oidc_login_state CASCADE");
  principals = new PrincipalsRepository(db);
  app = await buildHttpApp({
    config: loadHttpConfig(env),
    db,
    logger: false,
    fetchClientMetadata: async (clientId) => {
      if (clientId !== CLIENT_ID) throw new Error("unknown client");
      return { client_id: CLIENT_ID, client_name: "Test MCP Client", redirect_uris: [CLIENT_REDIRECT] };
    },
  });
  await app.listen({ host: "127.0.0.1", port: 0 });
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
}

/** Requests go to the listening app; URLs on the public origin are rewritten to it. */
function local(url: string): string {
  return url.startsWith(PUBLIC_URL) ? base + url.slice(PUBLIC_URL.length) : url.startsWith("/") ? base + url : url;
}

const get = (url: string, headers: Record<string, string> = {}) => fetch(local(url), { redirect: "manual", headers });
const postForm = (url: string, form: Record<string, string>) =>
  fetch(local(url), { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form) });

function hidden(html: string, name: string): string {
  const match = new RegExp(`name="${name}" value="([^"]*)"`).exec(html);
  if (!match) throw new Error(`hidden field ${name} not found`);
  return match[1]!;
}

interface SignInResult {
  callbackUrl: string;
  cookie: string;
  callback: Response;
}

/** MCP client → /oauth/authorize → SSO button → /oidc/login → fake IdP → /oidc/callback. */
async function signInAtIdp(user: FakeUser, pkceChallenge: string): Promise<SignInResult> {
  idp.nextUser = user;
  const authorize = await get(`/oauth/authorize?${new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: CLIENT_REDIRECT,
    code_challenge: pkceChallenge,
    code_challenge_method: "S256",
    state: "client-state",
    scope: "mcp",
    resource: PUBLIC_URL + "/mcp",
  })}`);
  expect(authorize.status).toBe(200);
  const signInHtml = await authorize.text();
  expect(signInHtml).toContain("Sign in with Authentik");
  expect(signInHtml).not.toContain('type="password"');
  const loginHref = /href="(\/oidc\/login\?oauth=[^"]+)"/.exec(signInHtml)?.[1];
  expect(loginHref).toBeDefined();

  const login = await get(loginHref!);
  expect(login.status).toBe(302);
  const setCookie = login.headers.get("set-cookie") ?? "";
  expect(setCookie).toContain(`${OIDC_COOKIE}=`);
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("Path=/oidc");
  const cookie = setCookie.split(";")[0]!;
  const idpUrl = new URL(login.headers.get("location")!);
  expect(idpUrl.href.startsWith(idp.issuer + "authorize")).toBe(true);
  expect(idpUrl.searchParams.get("redirect_uri")).toBe(PUBLIC_URL + "/oidc/callback");
  expect(idpUrl.searchParams.get("code_challenge_method")).toBe("S256");
  expect(idpUrl.searchParams.get("nonce")).toBeTruthy();

  const idpResponse = await fetch(idpUrl, { redirect: "manual" });
  expect(idpResponse.status).toBe(302);
  const callbackUrl = idpResponse.headers.get("location")!;
  expect(callbackUrl.startsWith(PUBLIC_URL + "/oidc/callback?")).toBe(true);
  const callback = await get(callbackUrl, { cookie });
  return { callbackUrl, cookie, callback };
}

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

/** Full MCP OAuth flow via OIDC; returns the token response. */
async function authorizeClient(user: FakeUser) {
  const { verifier, challenge } = pkce();
  const { callback } = await signInAtIdp(user, challenge);
  expect(callback.status).toBe(200);
  const consentHtml = await callback.text();
  expect(consentHtml).toContain("Test MCP Client");
  expect(callback.headers.get("content-security-policy")).toContain("form-action 'self' https://client.example");

  const approve = await postForm("/oauth/authorize", { oauth: hidden(consentHtml, "oauth"), ticket: hidden(consentHtml, "ticket"), action: "approve" });
  expect(approve.status).toBe(302);
  const redirect = new URL(approve.headers.get("location")!);
  expect(redirect.origin + redirect.pathname).toBe(CLIENT_REDIRECT);
  expect(redirect.searchParams.get("state")).toBe("client-state");
  expect(redirect.searchParams.get("iss")).toBe(PUBLIC_URL);

  const token = await postForm("/oauth/token", {
    grant_type: "authorization_code",
    code: redirect.searchParams.get("code")!,
    client_id: CLIENT_ID,
    redirect_uri: CLIENT_REDIRECT,
    code_verifier: verifier,
    resource: PUBLIC_URL + "/mcp",
  });
  expect(token.status).toBe(200);
  expect(token.headers.get("cache-control")).toBe("no-store");
  return (await token.json()) as { access_token: string; refresh_token: string };
}

let rpcId = 0;
async function mcp(token: string | undefined, method: string, params: Record<string, unknown> = {}) {
  return fetch(base + "/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
}

async function createProject(token: string, name: string): Promise<{ id: string; createdByPrincipalId: string }> {
  const response = await mcp(token, "tools/call", { name: "create_project", arguments: { name, status: "idea" } });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { result: { isError: boolean; content: { text: string }[] } };
  expect(body.result.isError).toBe(false);
  return JSON.parse(body.result.content[0]!.text);
}

async function listProjects(token: string): Promise<{ name: string }[]> {
  const response = await mcp(token, "resources/read", { uri: "mindsplosion://projects" });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { result: { contents: { text: string }[] } };
  return JSON.parse(body.result.contents[0]!.text);
}

describe("HTTP config", () => {
  const expectConfigError = (env: Record<string, string>, message: RegExp) => {
    expect(() => loadHttpConfig(env)).toThrow(ConfigError);
    expect(() => loadHttpConfig(env)).toThrow(message);
  };

  it("refuses to start without any authentication", () => {
    expectConfigError({ NODE_ENV: "test" }, /needs authentication/);
  });

  it("validates the OIDC settings", () => {
    const env = { NODE_ENV: "test", OIDC_ISSUER: "https://auth.example.org/application/o/mindsplosion/", OIDC_CLIENT_ID: "c", JWT_SECRET };
    expect(loadHttpConfig(env).oauth?.oidc.issuer).toBe("https://auth.example.org/application/o/mindsplosion/");
    expect(loadHttpConfig(env).oauth?.oidc.scopes).toBe("openid email profile");
    expectConfigError({ ...env, OIDC_CLIENT_ID: "" }, /OIDC_CLIENT_ID is required/);
    expectConfigError({ ...env, OIDC_ISSUER: "not a url" }, /absolute URL/);
    expectConfigError({ ...env, OIDC_SCOPES: "email profile" }, /openid/);
    expectConfigError({ ...env, OIDC_CREATE_USERS: "maybe" }, /OIDC_CREATE_USERS must be true or false/);
    expectConfigError({ ...env, OIDC_TRUST_EMAIL: "yes please" }, /OIDC_TRUST_EMAIL/);
    expectConfigError({ ...env, JWT_SECRET: "" }, /JWT_SECRET is required/);
    expectConfigError({ ...env, JWT_SECRET: Buffer.from("short").toString("base64") }, /at least 32 bytes/);
    expectConfigError({ ...env, NODE_ENV: "production", MCP_PUBLIC_URL: "https://m.example.org", OIDC_ISSUER: "http://auth.example.org/" }, /https: in production/);
    expectConfigError({ ...env, NODE_ENV: "production" }, /MCP_PUBLIC_URL is required/);
  });

  it("validates the static token", () => {
    expectConfigError({ NODE_ENV: "test", MINDSPLOSION_HTTP_TOKEN: "too-short" }, /at least 32 characters/);
    expect(loadHttpConfig({ NODE_ENV: "test", MINDSPLOSION_HTTP_TOKEN: STATIC_TOKEN }).staticToken?.subject).toBe("default-principal");
  });
});

describe("HTTP server with OIDC off (static token only)", () => {
  it("has no OAuth or OIDC routes and no SSO button", async () => {
    await start({ NODE_ENV: "test", MCP_PUBLIC_URL: PUBLIC_URL, MINDSPLOSION_HTTP_TOKEN: STATIC_TOKEN });
    for (const path of ["/oidc/login", "/oidc/callback", "/oauth/authorize", "/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"]) {
      expect((await get(path)).status, path).toBe(404);
    }
    expect((await get("/health")).status).toBe(200);
  });

  it("requires the static token on /mcp and acts as the stdio principal", async () => {
    await start({ NODE_ENV: "test", MCP_PUBLIC_URL: PUBLIC_URL, MINDSPLOSION_HTTP_TOKEN: STATIC_TOKEN });
    const anonymous = await mcp(undefined, "tools/list");
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("www-authenticate")).toBe('Bearer realm="mindsplosion"');
    expect((await mcp("wrong-token", "tools/list")).status).toBe(401);

    const project = await createProject(STATIC_TOKEN, "Via static token");
    const stdioPrincipal = await principals.findByExternalSubject("default-principal");
    expect(project.createdByPrincipalId).toBe(stdioPrincipal?.id);
  });
});

describe("HTTP server with OIDC sign-in", () => {
  it("publishes OAuth metadata without OpenID Provider fields and challenges /mcp", async () => {
    await start(oidcEnv());
    const prm = await (await get("/.well-known/oauth-protected-resource/mcp")).json();
    expect(prm).toMatchObject({ resource: PUBLIC_URL + "/mcp", authorization_servers: [PUBLIC_URL] });
    const asm = (await (await get("/.well-known/openid-configuration")).json()) as Record<string, unknown>;
    expect(asm.issuer).toBe(PUBLIC_URL);
    expect(asm).not.toHaveProperty("jwks_uri");
    expect(asm).not.toHaveProperty("userinfo_endpoint");
    expect(asm).not.toHaveProperty("id_token_signing_alg_values_supported");

    const anonymous = await mcp(undefined, "tools/list");
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("www-authenticate")).toBe(
      `Bearer resource_metadata="${PUBLIC_URL}/.well-known/oauth-protected-resource/mcp", scope="mcp"`,
    );
    const forged = await mcp("eyJhbGciOiJIUzI1NiJ9.e30.x", "tools/list");
    expect(forged.status).toBe(401);
    expect(forged.headers.get("www-authenticate")).toContain('error="invalid_token"');
    expect((await get("/oidc/login")).status).toBe(400); // no web UI: only MCP authorization starts a sign-in
  });

  it("runs the full MCP OAuth flow via OIDC and calls tools as the linked principal", async () => {
    await start(oidcEnv());
    // Pre-provisioned principal (e.g. the stdio one) with the IdP user's email.
    const owner = await principals.create("default-principal", "user", "Juha@Example.org");
    const other = await principals.create("someone-else", "user", "other@example.org");

    const tokens = await authorizeClient({ sub: "authentik-juha", email: "juha@example.org", email_verified: true, name: "Juha" });
    const tools = (await (await mcp(tokens.access_token, "tools/list")).json()) as { result: { tools: { name: string }[] } };
    expect(tools.result.tools.map((t) => t.name)).toContain("create_project");

    const project = await createProject(tokens.access_token, "Mindsplosion over HTTP");
    expect(project.createdByPrincipalId).toBe(owner.id);
    expect((await listProjects(tokens.access_token)).map((p) => p.name)).toEqual(["Mindsplosion over HTTP"]);

    // A second IdP user signs in and sees nothing of the first principal's data.
    const otherTokens = await authorizeClient({ sub: "authentik-other", email: "other@example.org", email_verified: true });
    expect(await listProjects(otherTokens.access_token)).toEqual([]);
    expect((await createProject(otherTokens.access_token, "Other")).createdByPrincipalId).toBe(other.id);

    // Second sign-in of the same IdP subject uses the stored link, even if the email changed.
    const again = await authorizeClient({ sub: "authentik-juha", email: "new-address@example.org", email_verified: true });
    expect((await listProjects(again.access_token)).map((p) => p.name)).toEqual(["Mindsplosion over HTTP"]);

    // Refresh tokens work, and the refreshed token acts as the same principal.
    const refreshed = await postForm("/oauth/token", { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: CLIENT_ID });
    expect(refreshed.status).toBe(200);
    const { access_token } = (await refreshed.json()) as { access_token: string };
    expect((await createProject(access_token, "After refresh")).createdByPrincipalId).toBe(owner.id);
  });

  it("refuses a callback whose state does not match the cookie", async () => {
    await start(oidcEnv());
    await principals.create("p", "user", "user@example.org");
    const { callbackUrl, cookie } = await signInAtIdp({ sub: "s1", email: "user@example.org", email_verified: true }, pkce().challenge);

    const noCookie = await get(callbackUrl);
    expect(noCookie.status).toBe(400);
    const wrongCookie = await get(callbackUrl, { cookie: `${OIDC_COOKIE}=someone-elses-state` });
    expect(wrongCookie.status).toBe(400);
    expect(await wrongCookie.text()).not.toContain("ticket");
    void cookie;
  });

  it("refuses a replayed state", async () => {
    await start(oidcEnv());
    await principals.create("p", "user", "user@example.org");
    const { callbackUrl, cookie, callback } = await signInAtIdp({ sub: "s1", email: "user@example.org", email_verified: true }, pkce().challenge);
    expect(callback.status).toBe(200);
    expect(callback.headers.get("set-cookie")).toContain("Max-Age=0");

    const replay = await get(callbackUrl, { cookie });
    expect(replay.status).toBe(400);
    expect(await replay.text()).toContain("expired or was already used");
  });

  it("shows an error page when the IdP returns an error", async () => {
    await start(oidcEnv());
    idp.nextError = "access_denied";
    try {
      const { callback } = await signInAtIdp({ sub: "s1" }, pkce().challenge);
      expect(callback.status).toBe(401);
      expect(await callback.text()).toContain("did not complete the sign-in");
    } finally {
      idp.nextError = undefined;
    }
  });

  it("does not link an unverified email unless OIDC_TRUST_EMAIL is set", async () => {
    await start(oidcEnv());
    const existing = await principals.create("p", "user", "user@example.org");
    const unverified = await signInAtIdp({ sub: "s-unverified", email: "user@example.org", email_verified: false }, pkce().challenge);
    expect(unverified.callback.status).toBe(403);
    expect(await unverified.callback.text()).toContain("No account for this sign-in");
    await stop();

    await start(oidcEnv({ OIDC_TRUST_EMAIL: "true" }));
    const linked = await principals.create("p", "user", "user@example.org");
    const tokens = await authorizeClient({ sub: "s-unverified", email: "user@example.org", email_verified: false });
    expect((await createProject(tokens.access_token, "Trusted")).createdByPrincipalId).toBe(linked.id);
    expect(existing.id).not.toBe(linked.id); // separate databases
  });

  it("creates principals only with OIDC_CREATE_USERS", async () => {
    await start(oidcEnv());
    const refused = await signInAtIdp({ sub: "newcomer", email: "new@example.org", email_verified: true }, pkce().challenge);
    expect(refused.callback.status).toBe(403);
    await stop();

    await start(oidcEnv({ OIDC_CREATE_USERS: "true" }));
    const tokens = await authorizeClient({ sub: "newcomer", email: "new@example.org", email_verified: true });
    const created = await principals.findByExternalSubject(`oidc:${idp.issuer}#newcomer`);
    expect(created?.email).toBe("new@example.org");
    expect((await createProject(tokens.access_token, "New")).createdByPrincipalId).toBe(created?.id);

    // The next sign-in reuses the principal instead of creating another one.
    await authorizeClient({ sub: "newcomer", email: "new@example.org", email_verified: true });
    expect((await principals.list()).length).toBe(1);
  });

  it("reads the email from userinfo when the ID token has none", async () => {
    await start(oidcEnv());
    const owner = await principals.create("p", "user", "userinfo@example.org");
    const tokens = await authorizeClient({ sub: "s-ui", email: "userinfo@example.org", email_verified: true, emailInIdToken: false });
    expect((await createProject(tokens.access_token, "Userinfo")).createdByPrincipalId).toBe(owner.id);
  });

  it("refuses disabled principals at sign-in, refresh and /mcp", async () => {
    await start(oidcEnv());
    const owner = await principals.create("p", "user", "user@example.org");
    const tokens = await authorizeClient({ sub: "s1", email: "user@example.org", email_verified: true });
    await principals.setDisabled(owner.id, true);

    expect((await mcp(tokens.access_token, "tools/list")).status).toBe(401);
    const refresh = await postForm("/oauth/token", { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: CLIENT_ID });
    expect(refresh.status).toBe(400);
    const signIn = await signInAtIdp({ sub: "s1", email: "user@example.org", email_verified: true }, pkce().challenge);
    expect(signIn.callback.status).toBe(403);
    expect(await signIn.callback.text()).toContain("disabled");
  });

  it("rejects consent without a valid ticket and codes without the PKCE verifier", async () => {
    await start(oidcEnv());
    await principals.create("p", "user", "user@example.org");
    const { callback } = await signInAtIdp({ sub: "s1", email: "user@example.org", email_verified: true }, pkce().challenge);
    const html = await callback.text();
    const oauth = hidden(html, "oauth");

    expect((await postForm("/oauth/authorize", { oauth, action: "approve" })).status).toBe(401);
    expect((await postForm("/oauth/authorize", { oauth, ticket: "forged", action: "approve" })).status).toBe(401);

    const approve = await postForm("/oauth/authorize", { oauth, ticket: hidden(html, "ticket"), action: "approve" });
    const code = new URL(approve.headers.get("location")!).searchParams.get("code")!;
    const token = await postForm("/oauth/token", { grant_type: "authorization_code", code, client_id: CLIENT_ID, redirect_uri: CLIENT_REDIRECT, code_verifier: pkce().verifier });
    expect(token.status).toBe(400);
  });
});
