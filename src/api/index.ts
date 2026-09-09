import { readFile } from "node:fs/promises";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "../config/index.js";
import { logger } from "../config/logger.js";
import { pool, query } from "../db/pool.js";
import { getOrCreateIndexerState } from "../db/indexerState.js";
import { isAddress, normalizeAddress } from "../lib/address.js";
import { contracts } from "../dex/contracts.js";
import { discoverTokenOnDemand, persistPool } from "../decode/entities.js";
import { identifyPool } from "../dex/poolIdentify.js";

const app = Fastify({ logger: false });
await app.register(cors, { origin: true });

/** Reject bad addresses before touching the DB; 400 with a consistent shape. */
function requireAddress(raw: string): `0x${string}` {
  if (!isAddress(raw)) {
    const err = new Error("invalid_address") as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }
  return normalizeAddress(raw);
}

app.setErrorHandler((err, _req, reply) => {
  const status = (err as { statusCode?: number }).statusCode ?? 500;
  if (status >= 500) logger.error({ err }, "request failed");
  reply.status(status).send({ error: status >= 500 ? "internal_error" : err.message });
});

// Minimal Phase 1 test console. Served from the API so there's no separate
// origin / CORS story. Read per-request so editing the HTML doesn't need a restart.
const consolePath = new URL("../../web/index.html", import.meta.url);
app.get("/", async (_req, reply) => {
  const html = await readFile(consolePath, "utf8");
  return reply.type("text/html").send(html);
});

app.get("/health", async (_req, reply) => {
  try {
    const state = await getOrCreateIndexerState();
    return {
      status: "ok",
      chainId: config.CHAIN_ID,
      db: true,
      indexedThroughBlock: state.lastProcessedBlock.toString(),
    };
  } catch (err) {
    // API is up but its datastore isn't reachable — report it rather than 500,
    // so the test console can show "API up / DB down".
    logger.warn({ err }, "health check: database unreachable");
    return reply.status(503).send({ status: "degraded", chainId: config.CHAIN_ID, db: false });
  }
});

app.get<{ Params: { address: string } }>("/api/v1/wallets/:address", async (req, reply) => {
  const address = requireAddress(req.params.address);
  const result = await query(
    "SELECT * FROM wallet_statistics WHERE chain_id = $1 AND wallet_address = $2",
    [config.CHAIN_ID, address]
  );
  if (!result.rows[0]) {
    // Not "wallet doesn't exist" — just that the analytics worker (Phase 3)
    // hasn't produced a summary for it yet.
    return reply.status(404).send({ error: "not_indexed_yet" });
  }
  return result.rows[0];
});

app.get<{ Params: { address: string }; Querystring: { limit?: string; before?: string } }>(
  "/api/v1/wallets/:address/transactions",
  async (req) => {
    const address = requireAddress(req.params.address);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const before = req.query.before ? Number(req.query.before) : null;

    const result = await query(
      `SELECT hash, block_number, transaction_index, from_address, to_address,
              value, gas_used, gas_price, status, timestamp
         FROM transactions
        WHERE chain_id = $1
          AND (from_address = $2 OR to_address = $2)
          AND ($3::bigint IS NULL OR block_number < $3)
        ORDER BY block_number DESC, transaction_index DESC
        LIMIT $4`,
      [config.CHAIN_ID, address, before, limit]
    );
    return { address, count: result.rows.length, transactions: result.rows };
  }
);

const TOKEN_DETAIL_SQL = `
  SELECT t.*, ts.price, ts.market_cap, ts.fdv, ts.liquidity_usd, ts.volume_24h, ts.price_confidence,
         agg.vol_24h, agg.swap_count_24h, agg.last_price, agg.pool_count
    FROM tokens t
    LEFT JOIN token_statistics ts
      ON ts.token_address = t.address AND ts.chain_id = t.chain_id
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(s.usd_value) FILTER (WHERE s.timestamp > now() - interval '24 hours'), 0) AS vol_24h,
        COUNT(*)                  FILTER (WHERE s.timestamp > now() - interval '24 hours') AS swap_count_24h,
        (SELECT sp.price FROM swaps sp
          WHERE sp.chain_id = t.chain_id AND (sp.token_in = t.address OR sp.token_out = t.address)
            AND sp.price IS NOT NULL
          ORDER BY sp.block_number DESC, sp.log_index DESC LIMIT 1) AS last_price,
        (SELECT COUNT(*) FROM pools p
          WHERE p.chain_id = t.chain_id AND (p.token0 = t.address OR p.token1 = t.address)) AS pool_count
      FROM swaps s
      WHERE s.chain_id = t.chain_id AND (s.token_in = t.address OR s.token_out = t.address)
    ) agg ON true
   WHERE t.chain_id = $1 AND t.address = $2`;

app.get<{ Params: { address: string } }>("/api/v1/tokens/:address", async (req, reply) => {
  const address = requireAddress(req.params.address);
  let result = await query(TOKEN_DETAIL_SQL, [config.CHAIN_ID, address]);

  if (!result.rows[0]) {
    // Never seen it — try to resolve it straight from the chain (one RPC call).
    const discovered = await discoverTokenOnDemand(address).catch(() => null);
    if (!discovered) return reply.status(404).send({ error: "not_an_erc20_or_unreachable" });
    result = await query(TOKEN_DETAIL_SQL, [config.CHAIN_ID, address]);
    if (!result.rows[0]) return reply.status(404).send({ error: "token_not_found" });
  }
  return result.rows[0];
});

// ---- Phase 2a DEX read layer ----
// 24h aggregates are computed inline here; Phase 2b precomputes them into
// token_statistics / pair_statistics on a worker.

// The chain has hundreds of thousands of pools/tokens; almost all never trade.
// These lists only consider entities that have at least one indexed swap, so the
// per-row aggregation stays bounded. Phase 2b replaces this with precomputed
// token_statistics / pair_statistics.

app.get<{ Querystring: { limit?: string } }>("/api/v1/tokens", async (req) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const result = await query(
    `WITH traded AS (
       SELECT token_address FROM (
         SELECT token_in  AS token_address FROM swaps WHERE chain_id = $1
         UNION
         SELECT token_out AS token_address FROM swaps WHERE chain_id = $1
       ) x
     )
     SELECT t.address, t.symbol, t.name, t.decimals, t.token_type, t.verified,
            agg.vol_24h, agg.swap_count_24h, agg.last_price, agg.pool_count
       FROM traded
       JOIN tokens t ON t.chain_id = $1 AND t.address = traded.token_address
       JOIN LATERAL (
         SELECT
           COALESCE(SUM(s.usd_value) FILTER (WHERE s.timestamp > now() - interval '24 hours'), 0) AS vol_24h,
           COUNT(*)                  FILTER (WHERE s.timestamp > now() - interval '24 hours') AS swap_count_24h,
           (SELECT sp.price FROM swaps sp
             WHERE sp.chain_id = $1 AND (sp.token_in = t.address OR sp.token_out = t.address)
               AND sp.price IS NOT NULL
             ORDER BY sp.block_number DESC, sp.log_index DESC LIMIT 1) AS last_price,
           (SELECT COUNT(*) FROM pools p
             WHERE p.chain_id = $1 AND (p.token0 = t.address OR p.token1 = t.address)) AS pool_count
         FROM swaps s
         WHERE s.chain_id = $1 AND (s.token_in = t.address OR s.token_out = t.address)
       ) agg ON true
      WHERE t.discovery_failed = false
      ORDER BY agg.vol_24h DESC NULLS LAST, agg.swap_count_24h DESC
      LIMIT $2`,
    [config.CHAIN_ID, limit]
  );
  return { count: result.rows.length, tokens: result.rows };
});

app.get<{ Querystring: { limit?: string } }>("/api/v1/pairs", async (req) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const result = await query(
    `WITH traded AS (
       SELECT DISTINCT pool_address FROM swaps WHERE chain_id = $1
     )
     SELECT p.address, p.dex, p.pool_type, p.fee_tier,
            t0.address AS token0, t0.symbol AS symbol0,
            t1.address AS token1, t1.symbol AS symbol1,
            agg.vol_24h, agg.swap_count_24h, agg.last_swap_at
       FROM traded
       JOIN pools p  ON p.chain_id = $1 AND p.address = traded.pool_address
       JOIN tokens t0 ON t0.chain_id = $1 AND t0.address = p.token0
       JOIN tokens t1 ON t1.chain_id = $1 AND t1.address = p.token1
       JOIN LATERAL (
         SELECT
           COALESCE(SUM(usd_value) FILTER (WHERE timestamp > now() - interval '24 hours'), 0) AS vol_24h,
           COUNT(*)                FILTER (WHERE timestamp > now() - interval '24 hours') AS swap_count_24h,
           MAX(timestamp) AS last_swap_at
         FROM swaps s WHERE s.chain_id = $1 AND s.pool_address = p.address
       ) agg ON true
      ORDER BY agg.vol_24h DESC NULLS LAST, agg.last_swap_at DESC NULLS LAST
      LIMIT $2`,
    [config.CHAIN_ID, limit]
  );
  return { count: result.rows.length, pairs: result.rows };
});

const PAIR_DETAIL_SQL = `
  SELECT p.*, t0.symbol AS symbol0, t0.decimals AS decimals0,
         t1.symbol AS symbol1, t1.decimals AS decimals1,
         agg.vol_24h, agg.swap_count_24h, agg.buys_24h, agg.sells_24h, agg.last_swap_at
    FROM pools p
    JOIN tokens t0 ON t0.chain_id = p.chain_id AND t0.address = p.token0
    JOIN tokens t1 ON t1.chain_id = p.chain_id AND t1.address = p.token1
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(usd_value) FILTER (WHERE timestamp > now() - interval '24 hours'), 0) AS vol_24h,
        COUNT(*)                FILTER (WHERE timestamp > now() - interval '24 hours') AS swap_count_24h,
        COUNT(*) FILTER (WHERE timestamp > now() - interval '24 hours' AND token_in = p.token0) AS sells_24h,
        COUNT(*) FILTER (WHERE timestamp > now() - interval '24 hours' AND token_out = p.token0) AS buys_24h,
        MAX(timestamp) AS last_swap_at
      FROM swaps s WHERE s.chain_id = p.chain_id AND s.pool_address = p.address
    ) agg ON true
   WHERE p.chain_id = $1 AND p.address = $2`;

app.get<{ Params: { address: string } }>("/api/v1/pairs/:address", async (req, reply) => {
  const address = requireAddress(req.params.address);
  let result = await query(PAIR_DETAIL_SQL, [config.CHAIN_ID, address]);

  if (!result.rows[0]) {
    // Unknown pool — confirm + classify it on-chain, then persist.
    const kp = await identifyPool(address as `0x${string}`).catch(() => null);
    if (!kp) return reply.status(404).send({ error: "not_a_pool_or_unreachable" });
    await discoverTokenOnDemand(kp.token0).catch(() => null);
    await discoverTokenOnDemand(kp.token1).catch(() => null);
    await persistPool(kp, 0n);
    result = await query(PAIR_DETAIL_SQL, [config.CHAIN_ID, address]);
    if (!result.rows[0]) return reply.status(404).send({ error: "pair_not_found" });
  }
  return result.rows[0];
});

app.get<{ Params: { address: string }; Querystring: { limit?: string; before?: string } }>(
  "/api/v1/pairs/:address/swaps",
  async (req) => {
    const address = requireAddress(req.params.address);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const before = req.query.before ? Number(req.query.before) : null;
    const result = await query(
      `SELECT s.transaction_hash, s.log_index, s.wallet_address, s.dex,
              s.token_in, s.token_out, s.amount_in, s.amount_out, s.usd_value, s.price,
              s.block_number, s.timestamp,
              ti.symbol AS symbol_in, ti.decimals AS decimals_in,
              to2.symbol AS symbol_out, to2.decimals AS decimals_out
         FROM swaps s
         JOIN tokens ti  ON ti.chain_id = s.chain_id  AND ti.address = s.token_in
         JOIN tokens to2 ON to2.chain_id = s.chain_id AND to2.address = s.token_out
        WHERE s.chain_id = $1 AND s.pool_address = $2
          AND ($3::bigint IS NULL OR s.block_number < $3)
        ORDER BY s.block_number DESC, s.log_index DESC
        LIMIT $4`,
      [config.CHAIN_ID, address, before, limit]
    );
    return { pair: address, count: result.rows.length, swaps: result.rows };
  }
);

app.get<{ Querystring: { limit?: string; before?: string } }>(
  "/api/v1/swaps/recent",
  async (req) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const before = req.query.before ? Number(req.query.before) : null;
    const result = await query(
      `SELECT s.transaction_hash, s.log_index, s.pool_address, s.wallet_address, s.dex,
              s.token_in, s.token_out, s.amount_in, s.amount_out, s.usd_value, s.price,
              s.block_number, s.timestamp,
              ti.symbol AS symbol_in, ti.decimals AS decimals_in,
              to2.symbol AS symbol_out, to2.decimals AS decimals_out
         FROM swaps s
         JOIN tokens ti  ON ti.chain_id = s.chain_id  AND ti.address = s.token_in
         JOIN tokens to2 ON to2.chain_id = s.chain_id AND to2.address = s.token_out
        WHERE s.chain_id = $1 AND ($2::bigint IS NULL OR s.block_number < $2)
        ORDER BY s.block_number DESC, s.log_index DESC
        LIMIT $3`,
      [config.CHAIN_ID, before, limit]
    );
    return { count: result.rows.length, swaps: result.rows };
  }
);

app.get("/api/v1/stats", async () => {
  // One round trip — Supabase RTT dominates, so don't fan out.
  // Table counts come from the planner's estimates (exact counts scan the whole
  // table, and "hundreds of thousands of pools" is close enough for a headline).
  const { rows } = await query<{
    tokens: string;
    pools: string;
    swaps_24h: string;
    active_wallets_24h: string;
    volume_24h: string;
    weth_usd: string | null;
  }>(
    `SELECT
       (SELECT reltuples::bigint FROM pg_class WHERE relname = 'tokens') AS tokens,
       (SELECT reltuples::bigint FROM pg_class WHERE relname = 'pools')  AS pools,
       (SELECT COUNT(*)                     FROM swaps WHERE chain_id = $1 AND timestamp > now() - interval '24 hours') AS swaps_24h,
       (SELECT COUNT(DISTINCT wallet_address) FROM swaps WHERE chain_id = $1 AND timestamp > now() - interval '24 hours') AS active_wallets_24h,
       (SELECT COALESCE(SUM(usd_value), 0)  FROM swaps WHERE chain_id = $1 AND timestamp > now() - interval '24 hours') AS volume_24h,
       (SELECT price FROM swaps
          WHERE chain_id = $1 AND price IS NOT NULL
            AND ( (token_in = $2 AND token_out = ANY($3)) OR (token_out = $2 AND token_in = ANY($3)) )
          ORDER BY block_number DESC, log_index DESC LIMIT 1) AS weth_usd`,
    [config.CHAIN_ID, contracts.weth, contracts.stablecoins.length ? contracts.stablecoins : [""]]
  );
  const r = rows[0];
  return {
    tokens: Number(r.tokens),
    pools: Number(r.pools),
    swaps_24h: Number(r.swaps_24h),
    active_wallets_24h: Number(r.active_wallets_24h),
    volume_24h: r.volume_24h,
    weth_usd: r.weth_usd,
  };
});

const server = app.listen({ port: config.API_PORT, host: "0.0.0.0" });
server
  .then((addr) => logger.info({ addr }, "API listening"))
  .catch((err) => {
    logger.error({ err }, "failed to start API");
    process.exit(1);
  });

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down API");
  await app.close().catch(() => undefined);
  await pool.end().catch(() => undefined);
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
