import type { PoolClient } from "pg";
import { withTransaction } from "./pool.js";
import { config } from "../config/index.js";
import { normalizeAddress, normalizeAddressOrNull } from "../lib/address.js";
import type { RawBlock, RawLog, RawReceipt, RawTransaction } from "../indexer/types.js";

/**
 * Persists a full block — the block row, every transaction, every log — AND
 * advances the indexer checkpoint, all in a single Postgres transaction.
 * Either the whole block lands and the checkpoint moves, or nothing does.
 *
 * Idempotent: every table has a uniqueness constraint and uses
 * ON CONFLICT DO NOTHING, so replaying a block (catch-up, crash-restart,
 * shallow-reorg reprocess) never double-counts.
 */
export async function saveBlock(block: RawBlock, receipts: readonly RawReceipt[]): Promise<void> {
  const receiptByHash = new Map(receipts.map((r) => [r.transactionHash.toLowerCase(), r]));
  const blockTs = Number(block.timestamp);

  await withTransaction(async (client) => {
    await insertBlock(client, block);

    for (const tx of block.transactions) {
      const receipt = receiptByHash.get(tx.hash.toLowerCase());
      await insertTransaction(client, block, tx, receipt, blockTs);
      for (const log of receipt?.logs ?? []) {
        await insertLog(client, block, log);
      }
    }

    await advanceCheckpoint(client, block.number, block.hash);
  });
}

async function insertBlock(client: PoolClient, block: RawBlock): Promise<void> {
  await client.query(
    `INSERT INTO blocks (chain_id, block_number, block_hash, parent_hash, timestamp)
     VALUES ($1, $2, $3, $4, to_timestamp($5))
     ON CONFLICT (chain_id, block_number) DO NOTHING`,
    [config.CHAIN_ID, block.number.toString(), block.hash, block.parentHash, Number(block.timestamp)]
  );
}

async function insertTransaction(
  client: PoolClient,
  block: RawBlock,
  tx: RawTransaction,
  receipt: RawReceipt | undefined,
  blockTs: number
): Promise<void> {
  const gasPrice = receipt?.effectiveGasPrice ?? tx.gasPrice ?? null;
  const status = receipt ? (receipt.status === "success" ? 1 : 0) : null;

  await client.query(
    `INSERT INTO transactions
       (chain_id, hash, block_number, block_hash, transaction_index, from_address, to_address,
        value, input, nonce, gas_used, gas_price, status, timestamp)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, to_timestamp($14))
     ON CONFLICT (chain_id, hash) DO NOTHING`,
    [
      config.CHAIN_ID,
      tx.hash,
      block.number.toString(),
      block.hash,
      tx.transactionIndex,
      normalizeAddress(tx.from),
      normalizeAddressOrNull(tx.to),
      (tx.value ?? 0n).toString(),
      tx.input ?? null,
      tx.nonce ?? null,
      receipt?.gasUsed?.toString() ?? null,
      gasPrice?.toString() ?? null,
      status,
      blockTs,
    ]
  );
}

async function insertLog(client: PoolClient, block: RawBlock, log: RawLog): Promise<void> {
  await client.query(
    `INSERT INTO transaction_logs
       (chain_id, transaction_hash, log_index, address, topic0, topic1, topic2, topic3,
        data, block_number, block_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (chain_id, transaction_hash, log_index) DO NOTHING`,
    [
      config.CHAIN_ID,
      log.transactionHash,
      log.logIndex,
      normalizeAddress(log.address),
      log.topics[0] ?? null,
      log.topics[1] ?? null,
      log.topics[2] ?? null,
      log.topics[3] ?? null,
      log.data,
      block.number.toString(),
      block.hash,
    ]
  );
}

async function advanceCheckpoint(
  client: PoolClient,
  blockNumber: bigint,
  blockHash: string
): Promise<void> {
  await client.query(
    `INSERT INTO indexer_state (chain_id, last_processed_block, last_processed_hash, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (chain_id) DO UPDATE
       SET last_processed_block = EXCLUDED.last_processed_block,
           last_processed_hash  = EXCLUDED.last_processed_hash,
           updated_at           = now()
       WHERE EXCLUDED.last_processed_block >= indexer_state.last_processed_block`,
    [config.CHAIN_ID, blockNumber.toString(), blockHash]
  );
}
