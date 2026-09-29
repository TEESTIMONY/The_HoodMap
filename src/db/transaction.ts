import type { PoolClient } from "pg";
import { isTransientDbError } from "./errors.js";

/** Anything that hands out clients the way pg.Pool does (lets tests pass a fake). */
export interface ClientSource {
  connect(): Promise<PoolClient>;
}

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * Runs `fn` inside one transaction on a checked-out client.
 *
 * Three things here are about surviving a database that goes away mid-flight
 * (an RDS restart, a failover), which used to crash or wedge the indexer:
 *
 *  1. pg-pool detaches its own 'error' listener while a client is checked out.
 *     With none attached, a dropped connection is an *unhandled* 'error' event
 *     and takes the whole process down. We hold one for the checkout's lifetime.
 *  2. If the connection is dead, ROLLBACK on it would throw (or hang) and mask
 *     the real error, so we skip it.
 *  3. A dead client must never go back into the pool as if healthy —
 *     release(err) destroys it instead of recycling it.
 */
export async function runInTransaction<T>(
  source: ClientSource,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await source.connect();
  let broken: Error | undefined;
  const onError = (err: Error): void => {
    broken = err;
  };
  client.on("error", onError);

  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    if (isTransientDbError(err)) broken ??= asError(err);
    if (!broken) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackErr) {
        broken = asError(rollbackErr);
      }
    }
    throw err;
  } finally {
    client.removeListener("error", onError);
    client.release(broken);
  }
}
