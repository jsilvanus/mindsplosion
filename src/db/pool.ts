import pg from "pg";

const { Pool } = pg;

export function createPool(connectionString = process.env.DATABASE_URL): pg.Pool {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  return new Pool({ connectionString });
}

export async function initializeDatabase(
  connectionString = process.env.DATABASE_URL,
): Promise<pg.Pool> {
  const pool = createPool(connectionString);
  // Test the connection
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
  return pool;
}

export type Db = Pick<pg.Pool, "query" | "connect">;
