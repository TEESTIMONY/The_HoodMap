import pg from "pg";
import { config } from "../config/index.js";
import { pgConnectionConfig } from "./connection.js";
import { runInTransaction } from "./transaction.js";

const { Pool } = pg;

export const pool = new Pool({
  ...pgConnectionConfig(),
  max: config.DATABASE_POOL_MAX,
  // Release pooled connections quickly so the several processes (indexer + api +
  // stats + scripts) don't hold more than the managed pooler allows.
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 20_000,
  keepAlive: true,
  // The OS default is to send the first TCP keepalive probe after ~2 hours of
  // silence. After a database restart, a connection can be half-open (our side
  // thinks it's fine, the server is gone) and a query on it just waits — which
  // is what wedged the indexer for an hour or two at a time. Probe sooner...
  keepAliveInitialDelayMillis: 10_000,
  // ...and don't wait forever on a query regardless. Slightly above
  // statement_timeout so the server-side limit fires first when the connection
  // is alive; this only trips when it isn't.
  query_timeout: 100_000,
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
export function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  return runInTransaction(pool, fn);
}
