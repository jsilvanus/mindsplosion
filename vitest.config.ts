import { defineConfig } from "vitest/config";

// The PostgreSQL test database (MINDSPLOSION_TEST_DATABASE_URL) is shared and truncated by each
// test file, so files must not run in parallel against it.
export default defineConfig({
  test: { fileParallelism: !process.env.MINDSPLOSION_TEST_DATABASE_URL },
});
