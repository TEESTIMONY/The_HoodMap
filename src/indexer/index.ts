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

/**
 * A 429 from the RPC provider isn't a bad block — it's the account-level rate
 * limit, and restarting the process (what running out of MAX_BLOCK_ATTEMPTS
 * does) doesn't relieve it, it just resets the backoff counter and immediately
 * re-triggers the same 429. Detect it so it gets connectWithRetry-style
 * patient, uncapped-attempt backoff instead of crashing the indexer.
 */
function isRateLimited(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("429") || msg.includes("Too Many Requests");
}

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

interface FetchedBlockData {
  block: RawBlock;
  receipts: RawReceipt[];
}

type FetchResult =
  | { ok: true; data: FetchedBlockData }
  | { ok: false; error: unknown };

/** +/-25% jitter so concurrently rate-limited fetches don't all retry in lockstep. */
function withJitter(ms: number): number {
  return Math.round(ms * (0.75 + Math.random() * 0.5));
}

/**
 * Network I/O only for one block — no DB writes, no reorg check. Safe to run
 * for many block numbers concurrently; the ordering-sensitive work happens in
 * commitBlock() instead.
 */
async function fetchBlockData(blockNumber: bigint): Promise<FetchedBlockData> {
  const viemBlock = (await httpClient.getBlock({
    blockNumber,
    includeTransactions: true,
  })) as unknown as ViemBlock<bigint, true>;
  const block = toRawBlock(viemBlock);
  const receipts = await fetchReceipts(blockNumber, block);
  return { block, receipts };
}

/**
 * Same retry policy as before a 429 gets uncapped attempts with capped
 * backoff (connectWithRetry-style — restarting doesn't relieve an
 * account-level rate limit); other errors give up after MAX_BLOCK_ATTEMPTS.
 * Never *rejects*, though — this sits unawaited in the prefetch window
 * (see runIndexer below) until its turn to commit, and an unhandled
 * rejection there would crash the process before anyone gets to handle it.
 */
async function fetchBlockWithRetry(blockNumber: bigint): Promise<FetchResult> {
  for (let attempt = 1; ; attempt++) {
    try {
      return { ok: true, data: await fetchBlockData(blockNumber) };
    } catch (err) {
      if (isRateLimited(err)) {
        const backoffMs = withJitter(Math.min(30_000, 1_000 * 2 ** (attempt - 1)));
        logger.warn(
          { block: blockNumber.toString(), attempt, backoffMs },
          "rate limited by RPC provider, backing off"
        );
        await sleep(backoffMs);
        continue;
      }
      if (attempt >= MAX_BLOCK_ATTEMPTS) {
        logger.error({ block: blockNumber.toString(), err }, "block fetch failed after max retries");
        return { ok: false, error: err };
      }
      const backoffMs = 500 * 2 ** attempt;
      logger.warn(
        { block: blockNumber.toString(), attempt, backoffMs, err: (err as Error).message },
        "block fetch failed, retrying"
      );
      await sleep(backoffMs);
    }
  }
}

/**
 * Reorg check + persist + decode for one already-fetched block. Must run
 * strictly in block-number order for every caller — this is what advances
 * the checkpoint, and an out-of-order advance would let a skipped block
 * silently never get indexed. Returns the next block number to commit:
 * normally `blockNumber + 1`, or an earlier number if a reorg was detected
 * and the checkpoint had to be rewound.
 */
async function commitBlock(blockNumber: bigint, { block, receipts }: FetchedBlockData): Promise<bigint> {
  const resumeFrom = await reconcileBeforeBlock(blockNumber, block.parentHash);
  if (resumeFrom < blockNumber) return resumeFrom;

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

// Startup dependencies (DB, RPC) can be briefly unreachable — a DNS blip, the
// laptop waking from sleep, Supabase's pooler warming up. Unlike a bad block
// (which has MAX_BLOCK_ATTEMPTS and gives up), there's nothing useful to do
// without these, so retry with capped backoff instead of crashing the whole
// `npm run dev` group over a few seconds of network flakiness.
async function connectWithRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const backoffMs = withJitter(Math.min(30_000, 1_000 * 2 ** (attempt - 1)));
      logger.warn(
        { attempt, backoffMs, err: (err as Error).message },
        `${label} failed, retrying`
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

  const state = await connectWithRetry(getOrCreateIndexerState, "fetch indexer checkpoint");
  let cachedTip = await connectWithRetry(() => httpClient.getBlockNumber(), "fetch chain tip");
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

  // Sliding window: keep up to INDEXER_FETCH_CONCURRENCY block fetches
  // in flight ahead of the commit cursor, overlapping RPC round-trip latency
  // instead of paying it one block at a time. Commits (reorg check + DB
  // write + checkpoint advance) still run strictly in order — reorg
  // detection and checkpoint correctness both depend on that, so only the
  // network fetch is parallelized, not the write path.
  const inFlight = new Map<bigint, Promise<FetchResult>>();
  let nextToFetch = cursor;

  function fillWindow(): void {
    while (inFlight.size < config.INDEXER_FETCH_CONCURRENCY && nextToFetch <= cachedTip) {
      inFlight.set(nextToFetch, fetchBlockWithRetry(nextToFetch));
      nextToFetch += 1n;
    }
  }

  while (running) {
    if (cursor > cachedTip) {
      cachedTip = await connectWithRetry(() => httpClient.getBlockNumber(), "refresh chain tip");
      if (cursor > cachedTip) {
        await sleep(config.INDEXER_POLL_INTERVAL_MS);
        continue;
      }
    }

    fillWindow();

    const pending = inFlight.get(cursor);
    if (!pending) {
      // Shouldn't happen given the invariants above (nextToFetch is always
      // >= cursor, and fillWindow just ran) — but if it ever does, don't
      // busy-spin the CPU while things sort themselves out.
      await sleep(50);
      continue;
    }
    inFlight.delete(cursor);
    const result = await pending;
    if (!result.ok) throw result.error; // genuinely bad block — crash, let systemd restart

    const nextCursor = await commitBlock(cursor, result.data);
    if (nextCursor < cursor) {
      // Reorg rewound the checkpoint. Every other in-flight fetch was for a
      // block number that may now be on the wrong fork — discard the whole
      // window and refill fresh from the rewound point.
      inFlight.clear();
      nextToFetch = nextCursor;
    }
    cursor = nextCursor;
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
