-- Built-in password sign-in for the OAuth authorization server (HTTP without OIDC).
-- Only a scrypt hash is stored (format scrypt$N$r$p$salt$hash, base64url); set it with
-- `pnpm principal set-password <id|external-subject>`.

ALTER TABLE principal ADD COLUMN password_hash text;
