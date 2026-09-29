import type { Db } from "../db/pool.js";
import { sha256 } from "./oauth/crypto.js";

export interface LoginState {
  codeVerifier: string;
  nonce: string;
  purpose: "oauth";
  oauthRequest: string | null;
}

export interface AuthorizationCodeRecord {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  principalId: string;
  scope: string;
}

export interface RefreshTokenRecord {
  clientId: string;
  principalId: string;
  scope: string;
}

/**
 * Persistence for the embedded OAuth authorization server and the OIDC relying party,
 * in the Mindsplosion database (SQLite or PostgreSQL; tables from migration 002).
 * Codes, refresh tokens and OIDC states are stored only as SHA-256 hashes.
 */
export class HttpAuthStore {
  constructor(private readonly db: Db) {}

  // --- OIDC sign-in state -------------------------------------------------

  async saveLoginState(state: string, record: LoginState, ttlMs: number): Promise<void> {
    await this.db.query("DELETE FROM oidc_login_state WHERE expires_ms < $1", [Date.now()]);
    await this.db.query(
      "INSERT INTO oidc_login_state (state_hash, code_verifier, nonce, purpose, oauth_request, expires_ms) VALUES ($1, $2, $3, $4, $5, $6)",
      [sha256(state), record.codeVerifier, record.nonce, record.purpose, record.oauthRequest, Date.now() + ttlMs],
    );
  }

  /** Single use: the row is deleted whether or not it is still valid. */
  async consumeLoginState(state: string): Promise<LoginState | undefined> {
    const result = await this.db.query<{ code_verifier: string; nonce: string; purpose: string; oauth_request: string | null; expires_ms: string | number }>(
      "DELETE FROM oidc_login_state WHERE state_hash = $1 RETURNING code_verifier, nonce, purpose, oauth_request, expires_ms",
      [sha256(state)],
    );
    const row = result.rows[0];
    if (!row || Number(row.expires_ms) < Date.now() || row.purpose !== "oauth") return undefined;
    return { codeVerifier: row.code_verifier, nonce: row.nonce, purpose: "oauth", oauthRequest: row.oauth_request };
  }

  // --- OIDC identity links ------------------------------------------------

  async findIdentity(issuer: string, subject: string): Promise<string | undefined> {
    const result = await this.db.query<{ principal_id: string }>(
      "SELECT principal_id FROM oidc_identity WHERE issuer = $1 AND subject = $2",
      [issuer, subject],
    );
    return result.rows[0]?.principal_id;
  }

  async linkIdentity(issuer: string, subject: string, principalId: string): Promise<void> {
    await this.db.query(
      "INSERT INTO oidc_identity (issuer, subject, principal_id) VALUES ($1, $2, $3)",
      [issuer, subject, principalId],
    );
  }

  async touchIdentity(issuer: string, subject: string): Promise<void> {
    await this.db.query(
      "UPDATE oidc_identity SET last_login_at = now() WHERE issuer = $1 AND subject = $2",
      [issuer, subject],
    );
  }

  // --- OAuth authorization codes and refresh tokens -----------------------

  async saveAuthorizationCode(code: string, record: AuthorizationCodeRecord, ttlMs: number): Promise<void> {
    await this.db.query("DELETE FROM oauth_authorization_code WHERE expires_ms < $1", [Date.now()]);
    await this.db.query(
      "INSERT INTO oauth_authorization_code (code_hash, client_id, redirect_uri, code_challenge, principal_id, scope, expires_ms) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [sha256(code), record.clientId, record.redirectUri, record.codeChallenge, record.principalId, record.scope, Date.now() + ttlMs],
    );
  }

  /** Single use: the code is deleted on the first attempt. */
  async consumeAuthorizationCode(code: string): Promise<AuthorizationCodeRecord | undefined> {
    const result = await this.db.query<{ client_id: string; redirect_uri: string; code_challenge: string; principal_id: string; scope: string; expires_ms: string | number }>(
      "DELETE FROM oauth_authorization_code WHERE code_hash = $1 RETURNING client_id, redirect_uri, code_challenge, principal_id, scope, expires_ms",
      [sha256(code)],
    );
    const row = result.rows[0];
    if (!row || Number(row.expires_ms) < Date.now()) return undefined;
    return { clientId: row.client_id, redirectUri: row.redirect_uri, codeChallenge: row.code_challenge, principalId: row.principal_id, scope: row.scope };
  }

  async saveRefreshToken(token: string, record: RefreshTokenRecord, ttlMs: number): Promise<void> {
    await this.db.query("DELETE FROM oauth_refresh_token WHERE expires_ms < $1", [Date.now()]);
    await this.db.query(
      "INSERT INTO oauth_refresh_token (token_hash, client_id, principal_id, scope, expires_ms) VALUES ($1, $2, $3, $4, $5)",
      [sha256(token), record.clientId, record.principalId, record.scope, Date.now() + ttlMs],
    );
  }

  async getRefreshToken(token: string): Promise<RefreshTokenRecord | undefined> {
    const result = await this.db.query<{ client_id: string; principal_id: string; scope: string; expires_ms: string | number }>(
      "SELECT client_id, principal_id, scope, expires_ms FROM oauth_refresh_token WHERE token_hash = $1",
      [sha256(token)],
    );
    const row = result.rows[0];
    if (!row || Number(row.expires_ms) < Date.now()) return undefined;
    return { clientId: row.client_id, principalId: row.principal_id, scope: row.scope };
  }
}
