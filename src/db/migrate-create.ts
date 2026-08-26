import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const migrationsDir = resolve(
  fileURLToPath(new URL("../../db/migrations", import.meta.url)),
);

const name = process.argv[2]?.trim().toLowerCase();
if (!name || !/^[a-z0-9][a-z0-9_-]*$/.test(name)) {
  console.error("Usage: pnpm db:migrate:create <name>");
  process.exit(1);
}

mkdirSync(migrationsDir, { recursive: true });
const next = readdirSync(migrationsDir)
  .map((file) => /^(\d+)_.*\.sql$/i.exec(file)?.[1])
  .filter((value): value is string => value !== undefined)
  .reduce((max, value) => Math.max(max, Number(value)), 0) + 1;

const path = resolve(migrationsDir, `${String(next).padStart(3, "0")}_${name}.sql`);
if (existsSync(path)) {
  console.error(`Migration already exists: ${path}`);
  process.exit(1);
}

writeFileSync(path, "-- Describe the schema change here.\n", "utf8");
console.log(`Created ${path}`);
