import pg from "pg";
import Database from "better-sqlite3";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;

const migrationsDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../db/migrations",
);

type Migration = { version: string; path: string };

function migrations(): Migration[] {
  return readdirSync(migrationsDir)
    .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
    .sort()
    .map((name) => ({
      version: name.replace(/\.sql$/i, ""),
      path: resolve(migrationsDir, name),
    }));
}

function sqliteSql(sql: string): string {
  return sql
    .replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;\s*/gi, "")
    .replace(/CREATE TYPE[\s\S]*?;\s*/gi, "")
    .replace(/\buuid\b/gi, "text")
    .replace(/\btimestamptz\b/gi, "text")
    .replace(/\bjsonb\b/gi, "text")
    .replace(/DEFAULT gen_random_uuid\(\)/gi, "DEFAULT (lower(hex(randomblob(16))))")
    .replace(/::int\b/gi, "")
    .replace(/::text\b/gi, "")
    .replace(/::jsonb\b/gi, "")
    .replace(/DEFAULT now\(\)/gi, "DEFAULT CURRENT_TIMESTAMP")
    .replace(/CHECK \(\(\(([^)]*)\) IS NOT NULL\)\)/gi, "CHECK ($1 IS NOT NULL)");
}

function sqliteFilename(connectionString?: string): string {
  if (connectionString?.startsWith("file:")) {
    return resolve(process.cwd(), connectionString.slice("file:".length));
  }
  if (connectionString && !connectionString.startsWith("postgres")) {
    return resolve(process.cwd(), connectionString);
  }
  return resolve(process.cwd(), ".data/mindsplosion.sqlite");
}

async function migratePostgres(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const applied = new Set<string>(
      (await client.query<{ version: string }>(
        "SELECT version FROM schema_migrations ORDER BY version",
      )).rows.map((row) => row.version),
    );

    for (const migration of migrations()) {
      if (applied.has(migration.version)) continue;

      const sql = readFileSync(migration.path, "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1)",
          [migration.version],
        );
        await client.query("COMMIT");
        console.log(`Applied ${migration.version}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

function migrateSqlite(connectionString?: string): void {
  const filename = sqliteFilename(connectionString);
  mkdirSync(dirname(filename), { recursive: true });
  const db = new Database(filename);

  try {
    db.pragma("foreign_keys = ON");
    db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    );

    const applied = new Set<string>(
      (db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as { version: string }[])
        .map((row) => row.version),
    );

    for (const migration of migrations()) {
      if (applied.has(migration.version)) continue;

      const statements = sqliteSql(readFileSync(migration.path, "utf8"))
        .split(";")
        .map((statement) => statement.trim())
        .filter(Boolean);

      const apply = db.transaction(() => {
        for (const statement of statements) db.exec(`${statement};`);
        db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(migration.version);
      });

      apply();
      console.log(`Applied ${migration.version}`);
    }
  } finally {
    db.close();
  }
}

const connectionString = process.env.DATABASE_URL;

if (connectionString?.startsWith("postgres://") || connectionString?.startsWith("postgresql://")) {
  await migratePostgres(connectionString);
} else {
  migrateSqlite(connectionString ?? process.env.MINDSPLOSION_DB_PATH);
}

console.log("Database migrations are up to date.");
