import { afterEach, describe, expect, it } from "vitest";
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
import { hashPassword, verifyPassword } from "../src/http/password.js";

// OAuth with the built-in password sign-in (JWT_SECRET set, no OIDC). Runs on SQLite, or on
// MINDSPLOSION_TEST_DATABASE_URL (migrated PostgreSQL, truncated here).
const PG_URL = process.env.MINDSPLOSION_TEST_DATABASE_URL;
const PUBLIC_URL = "http://mindsplosion.test";
const CLIENT_ID = "https://client.example/oauth/client.json";
const CLIENT_REDIRECT = "https://client.example/callback";
const JWT_SECRET = randomBytes(32).toString("base64");
const PASSWORD = "correct horse battery staple";

let dir: string;
let db: Db;
let principals: PrincipalsRepository;
let app: FastifyInstance | undefined;
let base: string;

afterEach(async () => {
  await app?.close();
  app = undefined;
  await (db as unknown as { end?: () => Promise<void> } | undefined)?.end?.();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

async function start(env: Record<string, string> = {}) {
  dir = mkdtempSync(join(tmpdir(), "mindsplosion-pw-"));
  db = createPool(PG_URL ?? join(dir, "test.sqlite"));
  if (PG_URL) await db.query("TRUNCATE principal CASCADE");
  principals = new PrincipalsRepository(db);
  app = await buildHttpApp({
    config: loadHttpConfig({ NODE_ENV: "test", MCP_PUBLIC_URL: PUBLIC_URL, JWT_SECRET, ...env }),
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

const postForm = (path: string, form: Record<string, string>) =>
  fetch(base + path, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form) });

function hidden(html: string, name: string): string {
  const match = new RegExp(`name="${name}" value="([^"]*)"`).exec(html);
  if (!match) throw new Error(`hidden field ${name} not found`);
  return match[1]!;
}

async function openSignIn(challenge: string) {
  const response = await fetch(base + "/oauth/authorize?" + new URLSearchParams({
    response_type: "code", client_id: CLIENT_ID, redirect_uri: CLIENT_REDIRECT, code_challenge: challenge,
    code_challenge_method: "S256", state: "s1", scope: "mcp", resource: PUBLIC_URL + "/mcp",
  }));
  expect(response.status).toBe(200);
  return response.text();
}

async function mcp(token: string, method: string, params: Record<string, unknown> = {}) {
  return fetch(base + "/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

describe("password hashing", () => {
  it("hashes with scrypt and verifies", async () => {
    const hash = await hashPassword(PASSWORD);
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(await verifyPassword(hash, PASSWORD)).toBe(true);
    expect(await verifyPassword(hash, PASSWORD + "!")).toBe(false);
    expect(await verifyPassword("garbage", PASSWORD)).toBe(false);
    await expect(hashPassword("short")).rejects.toThrow(/at least/);
  });
});

describe("HTTP config for password sign-in", () => {
  it("turns OAuth on with JWT_SECRET alone", () => {
    const config = loadHttpConfig({ NODE_ENV: "test", JWT_SECRET });
    expect(config.oauth?.passwordLogin).toBe(true);
    expect(config.oauth?.oidc).toBeUndefined();
    expect(() => loadHttpConfig({ NODE_ENV: "test", JWT_SECRET, MINDSPLOSION_PASSWORD_LOGIN: "false" })).toThrow(ConfigError);
  });
});

describe("HTTP server with password sign-in", () => {
  it("runs the whole MCP OAuth flow with a password and no OIDC", async () => {
    await start();
    expect((await fetch(base + "/oidc/login")).status).toBe(404);
    expect((await fetch(base + "/.well-known/oauth-authorization-server")).status).toBe(200);

    const me = await principals.create("default-principal", "user", "me@example.org");
    await principals.setPasswordHash(me.id, await hashPassword(PASSWORD));

    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const signIn = await openSignIn(challenge);
    expect(signIn).toContain('type="password"');
    expect(signIn).not.toContain("/oidc/login");
    const oauth = hidden(signIn, "oauth");

    const wrong = await postForm("/oauth/login", { oauth, login: "me@example.org", password: "wrong password!" });
    expect(wrong.status).toBe(401);
    expect(await wrong.text()).toContain("Invalid email, username or password");
    expect((await postForm("/oauth/login", { oauth, login: "nobody@example.org", password: PASSWORD })).status).toBe(401);

    // The email is matched case-insensitively; the external subject works as a username too.
    expect((await postForm("/oauth/login", { oauth, login: "default-principal", password: PASSWORD })).status).toBe(200);
    const consent = await postForm("/oauth/login", { oauth, login: "ME@example.org", password: PASSWORD });
    expect(consent.status).toBe(200);
    expect(consent.headers.get("content-security-policy")).toContain("form-action 'self' https://client.example");
    const consentHtml = await consent.text();
    expect(consentHtml).toContain("me@example.org");

    const approve = await postForm("/oauth/authorize", { oauth: hidden(consentHtml, "oauth"), ticket: hidden(consentHtml, "ticket"), action: "approve" });
    expect(approve.status).toBe(302);
    const redirect = new URL(approve.headers.get("location")!);
    const tokenResponse = await postForm("/oauth/token", {
      grant_type: "authorization_code", code: redirect.searchParams.get("code")!, client_id: CLIENT_ID,
      redirect_uri: CLIENT_REDIRECT, code_verifier: verifier, resource: PUBLIC_URL + "/mcp",
    });
    expect(tokenResponse.status).toBe(200);
    const { access_token } = (await tokenResponse.json()) as { access_token: string };

    const call = await mcp(access_token, "tools/call", { name: "create_project", arguments: { name: "Via password", status: "idea" } });
    const body = (await call.json()) as { result: { isError: boolean; content: { text: string }[] } };
    expect(body.result.isError).toBe(false);
    expect(JSON.parse(body.result.content[0]!.text).createdByPrincipalId).toBe(me.id);
  });

  it("refuses disabled accounts and accounts without a password", async () => {
    await start();
    const disabled = await principals.create("old", "user", "old@example.org");
    await principals.setPasswordHash(disabled.id, await hashPassword(PASSWORD));
    await principals.setDisabled(disabled.id, true);
    await principals.create("nopass", "user", "nopass@example.org");
    const oauth = hidden(await openSignIn("x".repeat(43)), "oauth");
    expect((await postForm("/oauth/login", { oauth, login: "old@example.org", password: PASSWORD })).status).toBe(401);
    expect((await postForm("/oauth/login", { oauth, login: "nopass", password: PASSWORD })).status).toBe(401);
    expect((await postForm("/oauth/login", { oauth: "bogus", login: "nopass", password: PASSWORD })).status).toBe(400);
  });

  it("rate-limits sign-in attempts", async () => {
    await start();
    const oauth = hidden(await openSignIn("y".repeat(43)), "oauth");
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await postForm("/oauth/login", { oauth, login: "x", password: "yyyyyyyyyyyy" })).status);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("shows both sign-in methods when OIDC is on and password sign-in is enabled", async () => {
    await start({ OIDC_ISSUER: "https://auth.example.org/", OIDC_CLIENT_ID: "c", MINDSPLOSION_PASSWORD_LOGIN: "true", OIDC_BUTTON_LABEL: "Use SSO" });
    const html = await openSignIn("z".repeat(43));
    expect(html).toContain("Use SSO");
    expect(html).toContain('type="password"');
  });
});
