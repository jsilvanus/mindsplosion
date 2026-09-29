# mindsplosion

A dashboard for your mind-explosion: handling all the ideas and repos you're producing with AI so they're not just chaos.

## Development

The local development database is SQLite and requires no database server or `.env` file.

```bash
pnpm install
pnpm dev
```

By default the database is created at `.data/mindsplosion.sqlite`. The schema is initialized automatically from the canonical migration in `db/migrations/001_initial.sql`.

To use another SQLite file:

```bash
MINDSPLOSION_DB_PATH=/path/to/mindsplosion.sqlite pnpm dev
```

`DATABASE_URL` is only needed when using PostgreSQL. Set it to a `postgres://` or `postgresql://` URL and the same database layer will use PostgreSQL instead of SQLite.

The `dev` command starts the Mindsplosion MCP server over stdio.

## Commands

- `pnpm dev` — start the local MCP server with SQLite
- `pnpm mcp` — start the MCP server (stdio)
- `pnpm http` — start the Streamable HTTP MCP server (see below)
- `pnpm build` — compile to `dist/`; then `pnpm start` (stdio) or `pnpm start:http` (HTTP) run the compiled code with plain `node`
- `pnpm principal list|create|set-email|disable|enable` — manage principals (`node dist/cli/principal.js` after a build)
- `pnpm test` — run tests (`MINDSPLOSION_TEST_DATABASE_URL=<migrated postgres URL, truncated by the tests>` runs the HTTP/OIDC tests on PostgreSQL)
- `pnpm typecheck` — run TypeScript type checking

## HTTP MCP server

`pnpm http` (development) or `pnpm build && pnpm start:http` (production) serves MCP over
Streamable HTTP at `POST /mcp`. It is stateless: every request gets its own MCP server and
transport. The stdio server is unchanged and keeps acting as the fixed `default-principal`.

Over HTTP, the principal (the identity that owns and is authorized for Mindsplosion data) comes
**only from the bearer token**, never from tool arguments. Every `/mcp` request without a valid
token gets `401` with a `WWW-Authenticate: Bearer ...` challenge. There is no anonymous mode:
the server refuses to start unless at least one of these is configured:

- **OAuth with OIDC sign-in** (`OIDC_ISSUER` set) — for MCP clients such as Claude or ChatGPT.
- **A static bearer token** (`MINDSPLOSION_HTTP_TOKEN`) — for clients that can send a fixed
  `Authorization` header. It acts as the principal `MINDSPLOSION_HTTP_TOKEN_SUBJECT`
  (default `default-principal`, i.e. the same data as stdio). It keeps working when OAuth is on.

With PostgreSQL run `pnpm db:migrate` before starting; SQLite databases are migrated on open.

### OAuth and OIDC

When `OIDC_ISSUER` is set, the server is both an **OAuth authorization server and resource
server** for MCP clients (following the codestash `mcp/api-connector-style` scaffold) and an
**OIDC relying party** toward your identity provider. It is never an OpenID Provider itself.

- Client identification by CIMD (the `client_id` is an HTTPS URL of the client metadata document),
  authorization code + S256 PKCE, refresh tokens (30 days), JWT access tokens (HS256, 1 hour,
  `iss` = `MCP_PUBLIC_URL`, `aud` = `<MCP_PUBLIC_URL>/mcp`, `sub` = principal id).
- Discovery: `/.well-known/oauth-protected-resource/mcp` (RFC 9728; also at the root path),
  `/.well-known/oauth-authorization-server`, and `/.well-known/openid-configuration` as an alias of
  the same OAuth metadata (no `jwks_uri`/ID-token fields).
- Sign-in on `/oauth/authorize` is OIDC only: the page has one button (`OIDC_BUTTON_LABEL`) that
  goes to `/oidc/login`, then the IdP, then `/oidc/callback`, then the consent page
  (Approve/Deny). The consent form carries a short-lived signed "login ticket" bound to the
  authorization request, and its CSP `form-action` allows the client's redirect URI.
- `/oidc/login` stores state, nonce and PKCE verifier in the database (keyed by the SHA-256 of the
  state, single use, 10 minutes) and sets an httpOnly `mindsplosion_oidc` cookie (SameSite=Lax,
  Path=/oidc, Secure in production). The callback requires the cookie to match `state`. Both routes
  are rate-limited per IP (30/minute, in memory). OAuth codes and refresh tokens are stored hashed.
- IdP discovery happens on first use, so the server starts even when the IdP is down.

**Mapping the IdP user to a principal** (table `oidc_identity`, migration `002`):

1. An existing link for (issuer, `sub`) is used.
2. Otherwise a principal whose `email` equals the IdP email (case-insensitive) is linked, if the
   email is verified (`email_verified: true`) or `OIDC_TRUST_EMAIL=true`.
3. Otherwise, with `OIDC_CREATE_USERS=true`, a new principal is created
   (external subject `oidc:<issuer>#<sub>`) and linked.
4. Otherwise the sign-in is refused ("No account for this sign-in; ask the administrator").

Disabled principals (`pnpm principal disable <id|subject>`) are refused at sign-in, on refresh and
on `/mcp`. To reach the data you already have from stdio, give that principal your email before the
first sign-in: `pnpm principal set-email default-principal you@example.org`. Who may sign in at
all is decided by the IdP (the authentik application's policy); there is no allow-list here.

### Environment

| Variable | Meaning |
|---|---|
| `PORT`, `HOST` | Listen address (default `3000`, `0.0.0.0`). |
| `MCP_PUBLIC_URL` | Public origin, e.g. `https://mindsplosion.example.org`. Default `http://localhost:<PORT>`; required and `https:` when `NODE_ENV=production`. |
| `NODE_ENV` | `production` requires https URLs and sets the `Secure` cookie flag. |
| `TRUST_PROXY` | Fastify `trustProxy`: `true` or a list of proxy addresses (for client IPs behind a reverse proxy). |
| `MINDSPLOSION_HTTP_TOKEN` | Optional static bearer token (>= 32 characters). |
| `MINDSPLOSION_HTTP_TOKEN_SUBJECT` | Principal external subject for the static token (default `default-principal`). |
| `OIDC_ISSUER` | Issuer URL exactly as the IdP publishes it (authentik: `https://auth.example.org/application/o/<slug>/`, keep the trailing slash). Empty = OAuth/OIDC off: no `/oauth/*`, `/oidc/*` or `.well-known` routes (404). |
| `OIDC_CLIENT_ID` | Required when `OIDC_ISSUER` is set. |
| `OIDC_CLIENT_SECRET` | Optional. Set = confidential client (HTTP Basic); unset = public client. PKCE is always used. |
| `OIDC_SCOPES` | Default `openid email profile`; must contain `openid`. |
| `OIDC_BUTTON_LABEL` | Sign-in button text. Default `Sign in with single sign-on`. |
| `OIDC_CREATE_USERS` | `true` = create a principal for an IdP user who has none. Default `false`. |
| `OIDC_TRUST_EMAIL` | `true` = link by email even when `email_verified` is not `true`. Default `false`. |
| `JWT_SECRET` | Base64, >= 32 bytes; signs access tokens and login tickets. Required when `OIDC_ISSUER` is set (`openssl rand -base64 32`). |

Invalid values (booleans, URLs, short secrets, missing client id) stop the server at startup with a
clear message. See `.env.example`.

### authentik

1. Create an **OAuth2/OpenID Provider**: client type *Confidential*, redirect URI
   `<MCP_PUBLIC_URL>/oidc/callback` (strict), and a **signing key** so ID tokens are RS256.
2. Create an **Application** that uses this provider; its policy bindings decide who may sign in.
3. Copy the provider's issuer URL (`https://auth.example.org/application/o/<slug>/`) to
   `OIDC_ISSUER`, and the client id/secret to `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET`.
