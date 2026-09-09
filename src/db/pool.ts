import pg from "pg";
import { config } from "../config/index.js";
import { pgConnectionConfig } from "./connection.js";

const { Pool } = pg;

export const pool = new Pool({
  ...pgConnectionConfig(),
  max: config.DATABASE_POOL_MAX,
  // Release pooled connections quickly so the several processes (indexer + api +
  // stats + scripts) don't hold more than the managed pooler allows.
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 20_000,
  keepAlive: true,
  // NOTE: statement_timeout set here is honoured by Supabase's *Session* pooler
  // but not the Transaction pooler (it ignores connection-level SET). The DB's
  // own default still applies; the API also 503s on 57014.
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
