import type { Log } from "viem";
import { logsClient } from "../indexer/rpcClient.js";
import { pool, query } from "../db/pool.js";
import { config } from "../config/index.js";
import { logger } from "../config/logger.js";
import { normalizeAddress } from "../lib/address.js";
import { insertBareTokens, persistPoolsBatch, persistV4Pools } from "../decode/entities.js";
import { dexForFactory } from "./poolIdentify.js";
import { parseV4Initialize } from "./uniswapV4.js";
import {
  V2_PAIR_CREATED_ABI,
  V2_PAIR_CREATED_TOPIC,
  V3_POOL_CREATED_ABI,
  V3_POOL_CREATED_TOPIC,
  V4_INITIALIZE_ABI,
  V4_INITIALIZE_TOPIC,
} from "./events.js";
import type { KnownPool } from "./adapter.js";

const BACKFILL_KIND = "pool_factory_events";
const START_SPAN = 500_000n;
const MAX_SPAN = 5_000_000n;
const MIN_SPAN = 2_000n;
const PAGE_PAUSE_MS = 120;
const PROGRESS_EVERY_MS = 15_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const FACTORY_EVENTS = [V2_PAIR_CREATED_ABI[0], V3_POOL_CREATED_ABI[0], V4_INITIALIZE_ABI[0]];

function looksLikeRangeError(err: unknown): boolean {
  const m = (err as Error)?.message?.toLowerCase() ?? "";
  return (
    m.includes("range") ||
    m.includes("limit") ||
    m.includes("10000") ||
    m.includes("response size") ||
    m.includes("too many") ||
    m.includes("timed out") ||
    m.includes("timeout")
  );
}

async function getCursor(): Promise<bigint> {
  const { rows } = await query<{ last_block: string }>(
    `SELECT last_block FROM backfill_state WHERE chain_id = $1 AND kind = $2`,
    [config.CHAIN_ID, BACKFILL_KIND]
  );
  return rows[0] ? BigInt(rows[0].last_block) : 0n;
}

async function setCursor(block: bigint): Promise<void> {
  await query(
    `INSERT INTO backfill_state (chain_id, kind, last_block, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (chain_id, kind) DO UPDATE SET
       last_block = GREATEST(backfill_state.last_block, EXCLUDED.last_block),
       updated_at = now()`,
    [config.CHAIN_ID, BACKFILL_KIND, block.toString()]
  );
}

function poolFromLog(log: Log & { eventName?: string; args?: Record<string, unknown> }): KnownPool | null {
  if (log.topics[0] === V4_INITIALIZE_TOPIC) {
    return parseV4Initialize({
      address: (log.address ?? "0x") as `0x${string}`,
      topics: log.topics as readonly `0x${string}`[],
      data: log.data,
      logIndex: log.logIndex ?? 0,
    });
  }
  const args = log.args;
  if (!args || !log.address) return null;
  const factory = normalizeAddress(log.address);

  if (log.topics[0] === V3_POOL_CREATED_TOPIC) {
    return {
      address: normalizeAddress(args.pool as string),
      dex: dexForFactory(factory, "v3"),
      poolType: "v3",
      token0: normalizeAddress(args.token0 as string),
      token1: normalizeAddress(args.token1 as string),
      feeTier: args.fee != null ? Number(args.fee as bigint) : null,
      factory,
    };
  }
  if (log.topics[0] === V2_PAIR_CREATED_TOPIC) {
    return {
      address: normalizeAddress(args.pair as string),
      dex: dexForFactory(factory, "v2"),
      poolType: "v2",
      token0: normalizeAddress(args.token0 as string),
      token1: normalizeAddress(args.token1 as string),
      feeTier: null,
      factory,
    };
  }
  return null;
}

/**
 * Scan the whole chain for Uniswap-V2 `PairCreated` and V3 `PoolCreated` events
 * (by topic0, across every factory — so forks are caught too) and persist every
 * pool. Resumes from `backfill_state`, so a restart only scans new blocks.
 *
 * Runs once at indexer startup and is available as `npm run backfill:pools`.
 */
const ADVISORY_LOCK_KEY = 918_273_641; // arbitrary, stable

export async function backfillPools(): Promise<{ pools: number; scannedTo: bigint }> {
  // One scanner at a time — the indexer auto-runs this and a human might also
  // `npm run backfill:pools`. The advisory lock is session-scoped, so it must be
  // held on a dedicated client for the whole run (pool.query() hops connections).
  const lockClient = await pool.connect();
  const held = await lockClient.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock($1) AS locked",
    [ADVISORY_LOCK_KEY]
  );
  if (!held.rows[0]?.locked) {
    lockClient.release();
    logger.info("pool backfill: another scan holds the lock — skipping");
    return { pools: 0, scannedTo: 0n };
  }

  try {
    return await runBackfill();
  } finally {
    await lockClient.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]).catch(() => undefined);
    lockClient.release();
  }
}

async function runBackfill(): Promise<{ pools: number; scannedTo: bigint }> {
  const tip = await logsClient.getBlockNumber();
  let from = (await getCursor()) + 1n;
  if (from > tip) return { pools: 0, scannedTo: tip };

  logger.info(
    { from: from.toString(), tip: tip.toString() },
    "pool backfill: scanning factory events"
  );

  let span = START_SPAN;
  let discovered = 0;
  let lastProgress = Date.now();

  let consecutiveFailures = 0;

  while (from <= tip) {
    const to = from + span - 1n < tip ? from + span - 1n : tip;
    let logs: Log[];
    try {
      // Topic-only (no address filter) so every factory — Uniswap V2/V3 *and*
      // forks like Pleiades — is caught.
      logs = (await logsClient.getLogs({
        events: FACTORY_EVENTS,
        fromBlock: from,
        toBlock: to,
      })) as Log[];
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures++;
      const rangeError = looksLikeRangeError(err);
      // The public RPC is flaky (TLS resets, timeouts) and chokes on wide dense
      // ranges. Either way the fix is: shrink and retry. Only give up if we
      // can't make progress even at the minimum span.
      if (span > MIN_SPAN) {
        span = span / 2n > MIN_SPAN ? span / 2n : MIN_SPAN;
        logger.warn(
          { from: from.toString(), span: span.toString(), rangeError, attempt: consecutiveFailures },
          "pool backfill: shrinking span after error"
        );
        await sleep(1_000);
        continue;
      }
      if (consecutiveFailures < 8) {
        logger.warn(
          { from: from.toString(), attempt: consecutiveFailures, err: (err as Error).message },
          "pool backfill: retrying at min span"
        );
        await sleep(2_000 * consecutiveFailures);
        continue;
      }
      logger.error(
        { from: from.toString(), to: to.toString(), err: (err as Error).message },
        "pool backfill: giving up (cursor saved — rerun to resume)"
      );
      throw err;
    }

    const pagePools: KnownPool[] = [];
    const pageTokens: string[] = [];
    for (const log of logs) {
      const kp = poolFromLog(log as Log & { args?: Record<string, unknown> });
      if (!kp) continue;
      pagePools.push(kp);
      pageTokens.push(kp.token0, kp.token1);
    }
    if (pagePools.length) {
      try {
        await insertBareTokens(pageTokens, from);
        await persistPoolsBatch(pagePools.filter((p) => p.poolType !== "v4"), from);
        await persistV4Pools(pagePools.filter((p) => p.poolType === "v4"), from);
        discovered += pagePools.length;
      } catch (err) {
        logger.warn(
          { from: from.toString(), to: to.toString(), err: (err as Error).message },
          "pool backfill: batch persist failed"
        );
      }
    }

    await setCursor(to);
    if (logs.length < 500 && span < MAX_SPAN) span *= 2n;
    from = to + 1n;

    if (Date.now() - lastProgress > PROGRESS_EVERY_MS) {
      const pct = Number(((to * 100n) / tip));
      logger.info(
        { at: to.toString(), tip: tip.toString(), pct, poolsFound: discovered },
        "pool backfill: progress"
      );
      lastProgress = Date.now();
    }
    if (from <= tip) await sleep(PAGE_PAUSE_MS);
  }

  if (discovered > 0) {
    // Keep the planner honest — these tables just grew a lot, and stale stats
    // make the API's join queries time out.
    await query("ANALYZE pools, tokens").catch(() => undefined);
  }
  logger.info({ pools: discovered, scannedTo: tip.toString() }, "pool backfill: done");
  return { pools: discovered, scannedTo: tip };
}
