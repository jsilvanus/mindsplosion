import { STDIO_PRINCIPAL_SUBJECT } from "../mcp/context.js";

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  scopes: string;
  buttonLabel: string;
  createUsers: boolean;
  trustEmail: boolean;
}

export interface StaticTokenConfig {
  token: string;
  /** External subject of the principal the token acts as. */
  subject: string;
}

export interface OAuthConfig {
  jwtSecret: Uint8Array;
  /** Built-in sign-in with a principal's email or external subject and password. */
  passwordLogin: boolean;
  /** Single sign-on through an OpenID Connect provider; absent when OIDC_ISSUER is unset. */
  oidc?: OidcConfig;
}

export interface HttpConfig {
  host: string;
  port: number;
  /** Public origin (no trailing slash); OAuth issuer, and `<publicUrl>/mcp` is the protected resource. */
  publicUrl: string;
  production: boolean;
  /** Fastify trustProxy: `true`, or a comma-separated list of proxy addresses/CIDRs. */
  trustProxy?: boolean | string;
  /**
   * Set when JWT_SECRET (or OIDC_ISSUER) is set: embedded OAuth AS + RS. Users sign in with a
   * password (built in) and/or through OIDC.
   */
  oauth?: OAuthConfig;
  /** Set when MINDSPLOSION_HTTP_TOKEN is set: a static bearer token for one principal. */
  staticToken?: StaticTokenConfig;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

type Env = Record<string, string | undefined>;

function value(env: Env, name: string): string | undefined {
  const raw = env[name]?.trim();
  return raw ? raw : undefined;
}

function bool(env: Env, name: string, fallback: boolean): boolean {
  const raw = value(env, name);
  if (raw === undefined) return fallback;
  if (/^(true|1|yes)$/i.test(raw)) return true;
  if (/^(false|0|no)$/i.test(raw)) return false;
  throw new ConfigError(`${name} must be true or false, got "${raw}"`);
}

function absoluteUrl(name: string, raw: string): URL {
  try {
    return new URL(raw);
  } catch {
    throw new ConfigError(`${name} must be an absolute URL`);
  }
}

/**
 * Reads the HTTP server configuration. Throws ConfigError on invalid or unsafe settings.
 *
 * The HTTP server never serves principal-bound data unauthenticated: it refuses to start
 * unless JWT_SECRET (OAuth with password and/or OIDC sign-in) or MINDSPLOSION_HTTP_TOKEN
 * (static bearer token) is configured.
 */
export function loadHttpConfig(env: Env = process.env): HttpConfig {
  const production = env.NODE_ENV === "production";
  const port = Number(value(env, "PORT") ?? "5981");
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new ConfigError(`Invalid PORT: ${env.PORT}`);

  const publicUrlRaw = value(env, "MCP_PUBLIC_URL");
  if (production && !publicUrlRaw) throw new ConfigError("MCP_PUBLIC_URL is required when NODE_ENV=production");
  const publicUrlParsed = absoluteUrl("MCP_PUBLIC_URL", publicUrlRaw ?? `http://localhost:${port}`);
  if (production && publicUrlParsed.protocol !== "https:") throw new ConfigError("MCP_PUBLIC_URL must use https: in production");
  const publicUrl = publicUrlParsed.toString().replace(/\/+$/, "");

  const config: HttpConfig = { host: value(env, "HOST") ?? "0.0.0.0", port, publicUrl, production };

  const trustProxy = value(env, "TRUST_PROXY");
  if (trustProxy !== undefined) {
    config.trustProxy = /^true$/i.test(trustProxy) ? true : trustProxy;
  }

  const token = value(env, "MINDSPLOSION_HTTP_TOKEN");
  if (token !== undefined) {
    if (token.length < 32) throw new ConfigError("MINDSPLOSION_HTTP_TOKEN must be at least 32 characters");
    config.staticToken = { token, subject: value(env, "MINDSPLOSION_HTTP_TOKEN_SUBJECT") ?? STDIO_PRINCIPAL_SUBJECT };
  }

  const issuer = value(env, "OIDC_ISSUER");
  let oidc: OidcConfig | undefined;
  if (issuer !== undefined) {
    const issuerUrl = absoluteUrl("OIDC_ISSUER", issuer);
    if (issuerUrl.protocol !== "https:" && issuerUrl.protocol !== "http:") throw new ConfigError("OIDC_ISSUER must be an http(s) URL");
    if (production && issuerUrl.protocol !== "https:") throw new ConfigError("OIDC_ISSUER must use https: in production");

    const clientId = value(env, "OIDC_CLIENT_ID");
    if (!clientId) throw new ConfigError("OIDC_CLIENT_ID is required when OIDC_ISSUER is set");

    const scopes = value(env, "OIDC_SCOPES") ?? "openid email profile";
    if (!scopes.split(/\s+/).includes("openid")) throw new ConfigError('OIDC_SCOPES must contain "openid"');

    const clientSecret = value(env, "OIDC_CLIENT_SECRET");
    oidc = {
      // Keep the issuer exactly as published (authentik issuers end with a slash).
      issuer,
      clientId,
      ...(clientSecret ? { clientSecret } : {}),
      scopes,
      buttonLabel: value(env, "OIDC_BUTTON_LABEL") ?? "Sign in with single sign-on",
      createUsers: bool(env, "OIDC_CREATE_USERS", false),
      trustEmail: bool(env, "OIDC_TRUST_EMAIL", false),
    };
  }

  // OAuth is on when JWT_SECRET is set (password sign-in) or OIDC_ISSUER is set (which needs it).
  const secretText = value(env, "JWT_SECRET");
  if (oidc && !secretText) throw new ConfigError("JWT_SECRET is required when OIDC_ISSUER is set");
  if (secretText) {
    const jwtSecret = new Uint8Array(Buffer.from(secretText, "base64"));
    if (jwtSecret.length < 32) throw new ConfigError("JWT_SECRET must be base64 and decode to at least 32 bytes");
    // Password sign-in defaults to on without OIDC and off with it.
    const passwordLogin = bool(env, "MINDSPLOSION_PASSWORD_LOGIN", !oidc);
    if (!passwordLogin && !oidc) throw new ConfigError("MINDSPLOSION_PASSWORD_LOGIN=false needs OIDC_ISSUER, or nobody can sign in");
    config.oauth = { jwtSecret, passwordLogin, ...(oidc ? { oidc } : {}) };
  }

  if (!config.oauth && !config.staticToken) {
    throw new ConfigError(
      "The HTTP server needs authentication: set JWT_SECRET (OAuth with password sign-in), OIDC_ISSUER (OAuth with OIDC sign-in, also needs JWT_SECRET) and/or MINDSPLOSION_HTTP_TOKEN (static bearer token).",
    );
  }
  return config;
}
