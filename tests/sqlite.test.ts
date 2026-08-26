import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPool } from "../src/db/pool.js";

describe("SQLite database", () => {
  it("initializes the schema without DATABASE_URL", async () => {
    const directory = mkdtempSync(join(tmpdir(), "mindsplosion-"));
    const databasePath = join(directory, "test.sqlite");

    try {
      const db = createPool(databasePath);
      const tables = await db.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      );
      const names = tables.rows.map((row) => row.name);

      expect(names).toContain("principal");
      expect(names).toContain("project");
      expect(names).toContain("goal");
      expect(names).toContain("task");
      expect(names).toContain("access_grant");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
