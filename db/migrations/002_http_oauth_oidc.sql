-- HTTP transport: OAuth authorization server state and OIDC sign-in.
--
-- principal.email lets an administrator pre-provision a principal (for example the
-- stdio "default-principal") so that an OIDC sign-in with that verified email is linked
-- to it. principal.disabled_at refuses sign-in and HTTP access for that principal.

ALTER TABLE principal ADD COLUMN email text;
ALTER TABLE principal ADD COLUMN disabled_at timestamptz;
CREATE UNIQUE INDEX principal_email_lower_key ON principal (lower(email));

-- IdP identity (issuer + subject) -> principal.
CREATE TABLE oidc_identity (
    issuer text NOT NULL,
    subject text NOT NULL,
    principal_id uuid NOT NULL REFERENCES principal(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_login_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (issuer, subject)
);
CREATE INDEX oidc_identity_principal_idx ON oidc_identity (principal_id);

-- Pending OIDC sign-ins, keyed by SHA-256 of the state; single use, 10 minutes.
CREATE TABLE oidc_login_state (
    state_hash text PRIMARY KEY,
    code_verifier text NOT NULL,
    nonce text NOT NULL,
    purpose text NOT NULL,
    oauth_request text,
    expires_ms bigint NOT NULL
);

-- OAuth authorization codes (single use) and refresh tokens, stored as SHA-256 hashes.
CREATE TABLE oauth_authorization_code (
    code_hash text PRIMARY KEY,
    client_id text NOT NULL,
    redirect_uri text NOT NULL,
    code_challenge text NOT NULL,
    principal_id uuid NOT NULL REFERENCES principal(id) ON DELETE CASCADE,
    scope text NOT NULL,
    expires_ms bigint NOT NULL
);

CREATE TABLE oauth_refresh_token (
    token_hash text PRIMARY KEY,
    client_id text NOT NULL,
    principal_id uuid NOT NULL REFERENCES principal(id) ON DELETE CASCADE,
    scope text NOT NULL,
    expires_ms bigint NOT NULL
);
