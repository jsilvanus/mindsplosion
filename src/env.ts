import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Loads ./.env if present (Node's own parser). Variables already set in the environment win. */
export function loadDotEnv(path = resolve(process.cwd(), ".env")): void {
  if (existsSync(path)) process.loadEnvFile(path);
}
