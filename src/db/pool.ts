import pg from "pg";
import { config } from "../config/index.js";
import { pgConnectionConfig } from "./connection.js";

const { Pool } = pg;

export const pool = new Pool({
  ...pgConnectionConfig(),
  max: config.DATABASE_POOL_MAX,
  // Release pooled connections quickly — Supabase's Session pooler has a small
  // per-project client-connection cap, so holding idle ones starves other
  // processes (indexer + api + stats + any scripts).
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 20_000,
  keepAlive: true,
  // Don't let a runaway query pin a scarce connection forever.
  statement_timeout: 90_000,
});

pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Unexpected Postgres pool error", err);
});

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as any[]);
}

/** Run a set of statements inside a single transaction. */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
