import pg from "pg";
import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

export interface DbClient {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
  release(): void;
}

export interface Db {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
  connect(): Promise<DbClient>;
}

class SqliteDb implements Db {
  private readonly db: Database.Database;

  constructor(filename: string) {
    mkdirSync(dirname(filename), { recursive: true });
    this.db = new Database(filename);
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  async query<T = Record<string, unknown>>(text: string, values: unknown[] = []): Promise<QueryResult<T>> {
    const sql = sqliteSql(text);
    const params = values.map(sqliteValue);
    const statement = this.db.prepare(sql);

    if (/^\s*(SELECT|PRAGMA|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) {
      const rows = statement.all(...params) as unknown as T[];
      return { rows: normalizeRows(rows), rowCount: rows.length };
    }

    const result = statement.run(...params);
    return { rows: [], rowCount: result.changes };
  }

  async connect(): Promise<DbClient> {
    return new SqliteClient(this);
  }

  private migrate(): void {
    this.db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    const migrationPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../db/migrations/001_initial.sql");
    const version = "001_initial";
    const applied = this.db.prepare("SELECT 1 FROM schema_migrations WHERE version = ?").get(version);
    if (applied) return;

    const sql = sqliteSchema(readFileSync(migrationPath, "utf8"));
    const migration = this.db.transaction(() => {
      for (const statement of sql.split(";")) {
        const trimmed = statement.trim();
        if (trimmed) this.db.exec(`${trimmed};`);
      }
      this.db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(version);
    });
    migration();
  }

  close(): void {
    this.db.close();
  }
}

class SqliteClient implements DbClient {
  constructor(private readonly db: SqliteDb) {}

  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<T>> {
    return this.db.query<T>(text, values);
  }

  release(): void {
    // SQLite uses one connection; the database remains open for the process lifetime.
  }
}

function sqliteValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return value;
}

function sqliteSql(sql: string): string {
  return sql
    .replace(/\$\d+/g, "?")
    .replace(/::(?:text|int|jsonb|uuid|timestamptz)\b/gi, "")
    .replace(/\bnow\(\)/gi, "CURRENT_TIMESTAMP");
}

function normalizeRows<T>(rows: T[]): T[] {
  return rows.map((row) => {
    if (!row || typeof row !== "object") return row;
    const result: Record<string, unknown> = { ...(row as Record<string, unknown>) };
    for (const [key, value] of Object.entries(result)) {
      if (key === "metadata" && typeof value === "string") {
        try { result[key] = JSON.parse(value); } catch { /* keep malformed data visible */ }
      } else if (/_at$/.test(key) && typeof value === "string") {
        const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
        if (!Number.isNaN(date.valueOf())) result[key] = date;
      }
    }
    return result as T;
  });
}

function sqliteSchema(postgresSql: string): string {
  return postgresSql
    .replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;\s*/gi, "")
    .replace(/CREATE TYPE[\s\S]*?;\s*/gi, "")
    .replace(/\buuid\b/gi, "text")
    .replace(/\btimestamptz\b/gi, "text")
    .replace(/\bjsonb\b/gi, "text")
    .replace(/DEFAULT gen_random_uuid\(\)/gi, "DEFAULT (lower(hex(randomblob(16))))")
    .replace(/::int\b/gi, "")
    .replace(/::text\b/gi, "")
    .replace(/::jsonb\b/gi, "")
    .replace(/DEFAULT now\(\)/gi, "DEFAULT CURRENT_TIMESTAMP");
}

export function createPool(connectionString = process.env.DATABASE_URL): Db {
  if (connectionString?.startsWith("postgres://") || connectionString?.startsWith("postgresql://")) {
    return new Pool({ connectionString }) as unknown as Db;
  }

  return new SqliteDb(sqliteFilename(connectionString ?? process.env.MINDSPLosion_DB_PATH));
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

export async function initializeDatabase(
  connectionString = process.env.DATABASE_URL,
): Promise<Db> {
  const db = createPool(connectionString);
  const client = await db.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
  return db;
}
