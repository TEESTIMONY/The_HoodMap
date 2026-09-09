import { config } from "../config/index.js";
import { logger } from "../config/logger.js";
import { httpClient } from "./rpcClient.js";
import { reconcileBeforeBlock } from "./reorg.js";
import { getOrCreateIndexerState } from "../db/indexerState.js";
import { saveBlock } from "../db/rawWrites.js";
import { decodeBlock } from "../decode/index.js";
import { backfillPools } from "../dex/backfillPools.js";
import { sweepTokenMetadata } from "../decode/entities.js";
import { pool } from "../db/pool.js";
import { mapWithConcurrency } from "../lib/concurrency.js";
import type { RawBlock, RawReceipt } from "./types.js";
import type { Block as ViemBlock, TransactionReceipt as ViemReceipt } from "viem";

const RECEIPT_CONCURRENCY = 8;
const MAX_BLOCK_ATTEMPTS = 5;

let running = true;
/** Flips permanently once we learn the RPC doesn't support eth_getBlockReceipts. */
let blockReceiptsUnsupported = false;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---- viem -> RawBlock/RawReceipt mappers ----

function toRawBlock(block: ViemBlock<bigint, true>): RawBlock {
  return {
    number: block.number!,
    hash: block.hash!,
    parentHash: block.parentHash,
    timestamp: block.timestamp,
    transactions: block.transactions.map((tx) => ({
      hash: tx.hash,
      transactionIndex: tx.transactionIndex ?? 0,
      from: tx.from,
      to: tx.to ?? null,
      value: tx.value,
      input: tx.input,
      nonce: tx.nonce,
      gasPrice: (tx as { gasPrice?: bigint }).gasPrice,
    })),
  };
}

function toRawReceipt(r: ViemReceipt): RawReceipt {
  return {
    transactionHash: r.transactionHash,
    gasUsed: r.gasUsed,
    effectiveGasPrice: r.effectiveGasPrice,
    status: r.status,
    logs: r.logs.map((log) => ({
      transactionHash: log.transactionHash ?? r.transactionHash,
      logIndex: log.logIndex ?? 0,
      address: log.address,
      topics: log.topics as readonly `0x${string}`[],
      data: log.data,
    })),
  };
}

async function fetchReceipts(blockNumber: bigint, block: RawBlock): Promise<RawReceipt[]> {
  if (!blockReceiptsUnsupported) {
    try {
      const raw = (await httpClient.getBlockReceipts({ blockNumber })) as unknown as ViemReceipt[];
      return raw.map(toRawReceipt);
    } catch (err) {
      blockReceiptsUnsupported = true;
      logger.warn(
        { err: (err as Error).message },
        "eth_getBlockReceipts unavailable — falling back to per-tx receipt fetches"
      );
    }
  }
  const receipts = await mapWithConcurrency(block.transactions, RECEIPT_CONCURRENCY, (tx) =>
    httpClient.getTransactionReceipt({ hash: tx.hash })
  );
  return receipts.map(toRawReceipt);
}

/**
 * Processes exactly one block. Returns the next block number to process —
 * normally `blockNumber + 1`, or an earlier number if a reorg was detected
 * and the checkpoint had to be rewound.
 */
async function processBlock(blockNumber: bigint): Promise<bigint> {
  const viemBlock = (await httpClient.getBlock({
    blockNumber,
    includeTransactions: true,
  })) as unknown as ViemBlock<bigint, true>;
  const block = toRawBlock(viemBlock);

  const resumeFrom = await reconcileBeforeBlock(blockNumber, block.parentHash);
  if (resumeFrom < blockNumber) return resumeFrom;

  const receipts = await fetchReceipts(blockNumber, block);
  await saveBlock(block, receipts);

  logger.info(
    {
      block: blockNumber.toString(),
      txCount: block.transactions.length,
      logCount: receipts.reduce((n, r) => n + r.logs.length, 0),
    },
    "block indexed"
  );

  // Derived layer (transfers / swaps / liquidity). Best-effort: raw data is
  // already committed, so a decode failure is logged and left for re-decode
  // rather than stalling the indexer.
  try {
    const decoded = await decodeBlock(block, receipts);
    if (decoded.swaps || decoded.transfers || decoded.liquidityEvents) {
      logger.info({ block: blockNumber.toString(), ...decoded }, "block decoded");
    }
  } catch (err) {
    logger.error(
      { block: blockNumber.toString(), err: (err as Error).message },
      "decode failed — raw data safe, re-decode later"
    );
  }

  return blockNumber + 1n;
}

async function processBlockWithRetry(blockNumber: bigint): Promise<bigint> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await processBlock(blockNumber);
    } catch (err) {
      if (attempt >= MAX_BLOCK_ATTEMPTS) {
        logger.error({ block: blockNumber.toString(), err }, "block failed after max retries");
        throw err;
      }
      const backoffMs = 500 * 2 ** attempt;
      logger.warn(
        { block: blockNumber.toString(), attempt, backoffMs, err: (err as Error).message },
        "block processing failed, retrying"
      );
      await sleep(backoffMs);
    }
  }
}

async function main(): Promise<void> {
  logger.info({ chainId: config.CHAIN_ID, chainName: config.CHAIN_NAME }, "indexer starting");

  // Catch pool discovery up to the chain tip via factory events (incremental
  // after the first run). Runs alongside the live loop rather than blocking it —
  // the first full scan can take a while on the rate-limited backfill RPC, and
  // lazy discovery covers anything it hasn't reached yet.
  void backfillPools().catch((err) => {
    logger.error(
      { err: (err as Error).message },
      "pool backfill failed — lazy discovery still active"
    );
  });

  // Fill metadata for the bare token rows the backfill leaves behind.
  let sweeping = false;
  const metaSweep = setInterval(() => {
    if (sweeping) return;
    sweeping = true;
    void sweepTokenMetadata(150)
      .then((n) => {
        if (n) logger.info({ resolved: n }, "token metadata sweep");
      })
      .catch((err) => logger.warn({ err: (err as Error).message }, "token metadata sweep failed"))
      .finally(() => {
        sweeping = false;
      });
  }, 20_000);
  metaSweep.unref?.();

  const state = await getOrCreateIndexerState();
  let cachedTip = await httpClient.getBlockNumber();
  let cursor =
    state.lastProcessedBlock > 0n ? state.lastProcessedBlock + 1n : cachedTip;

  logger.info(
    {
      checkpoint: state.lastProcessedBlock.toString(),
      tip: cachedTip.toString(),
      startBlock: cursor.toString(),
    },
    "resuming from checkpoint"
  );

  while (running) {
    if (cursor > cachedTip) {
      cachedTip = await httpClient.getBlockNumber();
      if (cursor > cachedTip) {
        await sleep(config.INDEXER_POLL_INTERVAL_MS);
        continue;
      }
    }
    cursor = await processBlockWithRetry(cursor);
  }
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down indexer");
  running = false;
  await pool.end().catch(() => undefined);
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

main().catch((err) => {
  logger.error({ err }, "indexer crashed");
  process.exit(1);
});
