import type { PoolClient } from "pg";
import { config } from "../config/index.js";
import { logger } from "../config/logger.js";
import { httpClient } from "./rpcClient.js";
import { query, withTransaction } from "../db/pool.js";
import { setCheckpoint } from "../db/indexerState.js";

/** How far back we're willing to unwind automatically before demanding a human. */
const MAX_REORG_DEPTH = 20;

/** Raw + event tables that carry `block_number` and must be rewound on a reorg. */
const BLOCK_SCOPED_TABLES = [
  "transaction_logs",
  "transactions",
  "token_transfers",
  "swaps",
  "liquidity_events",
  "blocks",
] as const;

async function storedHash(blockNumber: bigint): Promise<string | null> {
  const { rows } = await query<{ block_hash: string }>(
    "SELECT block_hash FROM blocks WHERE chain_id = $1 AND block_number = $2",
    [config.CHAIN_ID, blockNumber.toString()]
  );
  return rows[0]?.block_hash ?? null;
}

async function rewindTo(ancestor: bigint): Promise<void> {
  const newCheckpoint = ancestor < 0n ? 0n : ancestor;
  // Block `newCheckpoint` itself is never deleted, so its stored hash is still
  // readable here regardless of transaction visibility.
  const ancestorHash = await storedHash(newCheckpoint);
  await withTransaction(async (client: PoolClient) => {
    for (const table of BLOCK_SCOPED_TABLES) {
      await client.query(`DELETE FROM ${table} WHERE chain_id = $1 AND block_number > $2`, [
        config.CHAIN_ID,
        newCheckpoint.toString(),
      ]);
    }
    await setCheckpoint(client, newCheckpoint, ancestorHash);
  });
}

/**
 * Called right before processing `nextBlock`. `parentHash` is that block's
 * reported parent. If it doesn't match what we stored for `nextBlock - 1`, the
 * chain reorged: walk backward comparing canonical hashes to stored hashes
 * until the common ancestor, delete everything above it, rewind the checkpoint.
 *
 * Returns the block number to (re)start from — `nextBlock` unchanged, or
 * `ancestor + 1` after a rewind.
 */
export async function reconcileBeforeBlock(nextBlock: bigint, parentHash: string): Promise<bigint> {
  const prevNumber = nextBlock - 1n;
  if (prevNumber < 0n) return nextBlock;

  const storedPrev = await storedHash(prevNumber);
  if (storedPrev === null || storedPrev === parentHash) return nextBlock;

  logger.warn(
    { block: nextBlock.toString(), storedPrev, parentHash },
    "reorg detected — parent hash mismatch, walking back to common ancestor"
  );

  for (let depth = 1; depth <= MAX_REORG_DEPTH; depth++) {
    const candidate = prevNumber - BigInt(depth - 1);
    if (candidate < 0n) {
      await rewindTo(0n);
      return 1n;
    }

    const canonical = await httpClient.getBlock({ blockNumber: candidate });
    const stored = await storedHash(candidate);

    if (stored === null || stored === canonical.hash) {
      logger.warn(
        { ancestor: candidate.toString(), depth },
        "reorg common ancestor found — deleting orphaned blocks, rewinding checkpoint"
      );
      await rewindTo(candidate);
      return candidate + 1n;
    }
  }

  throw new Error(
    `reorg deeper than ${MAX_REORG_DEPTH} blocks at block ${nextBlock.toString()} — manual intervention required`
  );
}
