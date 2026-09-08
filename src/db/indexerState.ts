import type { PoolClient } from "pg";
import { query } from "./pool.js";
import { config } from "../config/index.js";

export interface IndexerState {
  chainId: number;
  lastProcessedBlock: bigint;
  lastProcessedHash: string | null;
}

interface IndexerStateRow {
  chain_id: string; // pg returns BIGINT as string
  last_processed_block: string;
  last_processed_hash: string | null;
}

function fromRow(row: IndexerStateRow): IndexerState {
  return {
    chainId: Number(row.chain_id),
    lastProcessedBlock: BigInt(row.last_processed_block),
    lastProcessedHash: row.last_processed_hash,
  };
}

/**
 * Current checkpoint for this chain, creating a fresh (block 0) row the
 * first time the indexer ever runs.
 */
export async function getOrCreateIndexerState(): Promise<IndexerState> {
  const existing = await query<IndexerStateRow>(
    "SELECT * FROM indexer_state WHERE chain_id = $1",
    [config.CHAIN_ID]
  );
  if (existing.rows[0]) return fromRow(existing.rows[0]);

  const inserted = await query<IndexerStateRow>(
    `INSERT INTO indexer_state (chain_id, last_processed_block) VALUES ($1, 0)
     ON CONFLICT (chain_id) DO UPDATE SET chain_id = EXCLUDED.chain_id
     RETURNING *`,
    [config.CHAIN_ID]
  );
  return fromRow(inserted.rows[0]);
}

/**
 * Force the checkpoint to a specific block (used by reorg repair to rewind
 * to the last common ancestor before reprocessing forward). Unlike the
 * happy-path checkpoint advance in saveBlock, this is allowed to move
 * backward.
 */
export async function setCheckpoint(
  client: PoolClient,
  blockNumber: bigint,
  blockHash: string | null
): Promise<void> {
  await client.query(
    `UPDATE indexer_state
       SET last_processed_block = $2, last_processed_hash = $3, updated_at = now()
     WHERE chain_id = $1`,
    [config.CHAIN_ID, blockNumber.toString(), blockHash]
  );
}
