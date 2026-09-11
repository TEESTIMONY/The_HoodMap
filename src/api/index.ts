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
import { fetchV4PoolKey } from "../dex/uniswapV4.js";
import { computeTokenStats } from "../analytics/statistics.js";
import { computeWalletPnl } from "../analytics/wallet.js";

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

/** A pool reference is a 20-byte address (V2/V3) or a 32-byte PoolId (V4). */
function requirePoolRef(raw: string): string {
  if (/^0x[0-9a-fA-F]{40}$/.test(raw) || /^0x[0-9a-fA-F]{64}$/.test(raw)) return raw.toLowerCase();
  const err = new Error("invalid_pool_ref") as Error & { statusCode: number };
  err.statusCode = 400;
  throw err;
}

const DB_ERROR_CODES = new Set([
  "57014", // statement_timeout
  "53300", // too_many_connections
  "08006", // connection_failure
  "08001", // sqlclient_unable_to_establish_connection
  "ECONNREFUSED",
  "ETIMEDOUT",
]);

app.setErrorHandler((err, _req, reply) => {
  const code = (err as { code?: string }).code;
  const msg = (err as Error).message ?? "";
  const isDbTrouble =
    (code && DB_ERROR_CODES.has(code)) ||
    /statement timeout|connection terminated|Connection terminated|checkout|too many clients/i.test(msg);

  if (isDbTrouble) {
    logger.warn({ code, msg }, "database unavailable / slow");
    return reply.status(503).send({ error: "database_unavailable", detail: "the datastore is unreachable or overloaded — retry shortly" });
  }

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

app.get<{ Params: { address: string }; Querystring: { refresh?: string } }>(
  "/api/v1/wallets/:address",
  async (req) => {
    const address = requireAddress(req.params.address);
    const cached = await query<{ computed_at: string; indexed_through_block: string }>(
      "SELECT * FROM wallet_statistics WHERE chain_id = $1 AND wallet_address = $2",
      [config.CHAIN_ID, address]
    );
    const row = cached.rows[0];
    const ageMs = row?.computed_at ? Date.now() - new Date(row.computed_at).getTime() : Infinity;

    // Recompute on demand: never computed, stale (>5min — the wallet backfill is
    // cached ~10min anyway), or ?refresh=1. Bounded by the wallet's swap count.
    if (!row || ageMs > 300_000 || req.query.refresh === "1") {
      const summary = await computeWalletPnl(address);
      if (summary.total_trades === 0) {
        return { has_trades: false, ...summary };
      }
      const fresh = await query(
        "SELECT * FROM wallet_statistics WHERE chain_id = $1 AND wallet_address = $2",
        [config.CHAIN_ID, address]
      );
      return { has_trades: true, ...fresh.rows[0] };
    }
    return { has_trades: (row as { total_trades?: number }).total_trades !== 0, ...row };
  }
);

app.get<{ Params: { address: string } }>("/api/v1/wallets/:address/positions", async (req) => {
  const address = requireAddress(req.params.address);
  const result = await query(
    `SELECT p.token_address, p.quantity, p.average_cost, p.cost_basis, p.realized_pnl,
            p.unrealized_pnl, p.current_price, p.current_value, p.is_open,
            p.buy_usd, p.sell_usd, p.first_buy_at, p.last_activity_at,
            t.symbol, t.name, t.decimals, ts.price AS market_price
       FROM positions p
       JOIN tokens t ON t.chain_id = p.chain_id AND t.address = p.token_address
       LEFT JOIN token_statistics ts ON ts.chain_id = p.chain_id AND ts.token_address = p.token_address
      WHERE p.chain_id = $1 AND p.wallet_address = $2
      ORDER BY p.is_open DESC, ABS(COALESCE(p.current_value, 0)) DESC, ABS(p.realized_pnl) DESC`,
    [config.CHAIN_ID, address]
  );
  return { wallet: address, count: result.rows.length, positions: result.rows };
});

app.get<{ Params: { address: string }; Querystring: { limit?: string; before?: string } }>(
  "/api/v1/wallets/:address/trades",
  async (req) => {
    const address = requireAddress(req.params.address);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const before = req.query.before ?? null;
    const result = await query(
      `SELECT tr.token_address, tr.side, tr.quantity, tr.price, tr.usd_value,
              tr.cost_basis, tr.realized_pnl, tr.dex, tr.tx_hash, tr.timestamp,
              t.symbol, t.decimals
         FROM trades tr
         JOIN tokens t ON t.chain_id = tr.chain_id AND t.address = tr.token_address
        WHERE tr.chain_id = $1 AND tr.wallet_address = $2
          AND ($3::timestamptz IS NULL OR tr.timestamp < $3::timestamptz)
        ORDER BY tr.timestamp DESC
        LIMIT $4`,
      [config.CHAIN_ID, address, before, limit]
    );
    return { wallet: address, count: result.rows.length, trades: result.rows };
  }
);

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

// Everything numeric comes from token_statistics, refreshed every ~45s by the
// stats worker. A token with no ts row yet (just discovered, not traded) returns
// identity fields with nulls for price/volume/liquidity.
const TOKEN_DETAIL_SQL = `
  SELECT t.address, t.name, t.symbol, t.decimals, t.total_supply, t.token_type, t.verified,
         t.logo_url, t.created_block, t.created_at AS first_seen,
         ts.price, ts.price_native, ts.market_cap, ts.fdv, ts.liquidity_usd,
         ts.volume_24h, ts.volume_6h, ts.volume_1h,
         ts.buy_count_24h, ts.sell_count_24h, ts.pool_count,
         ts.price_confidence, ts.last_trade_at, ts.updated_at AS stats_updated_at
    FROM tokens t
    LEFT JOIN token_statistics ts
      ON ts.token_address = t.address AND ts.chain_id = t.chain_id
   WHERE t.chain_id = $1 AND t.address = $2`;

app.get<{ Params: { address: string } }>("/api/v1/tokens/:address", async (req, reply) => {
  const address = requireAddress(req.params.address);
  let result = await query(TOKEN_DETAIL_SQL, [config.CHAIN_ID, address]);

  if (!result.rows[0]) {
    // Never seen it — resolve identity straight from the chain (one RPC call).
    const discovered = await discoverTokenOnDemand(address).catch(() => null);
    if (!discovered) return reply.status(404).send({ error: "not_an_erc20_or_unreachable" });
    result = await query(TOKEN_DETAIL_SQL, [config.CHAIN_ID, address]);
    if (!result.rows[0]) return reply.status(404).send({ error: "token_not_found" });
  }

  const row = result.rows[0] as { price: string | null; stats_updated_at: string | null };
  // Bounded RPC on the request path *only* when there's nothing useful to show:
  // no price yet, or stats gone stale (worker covers traded tokens every 45s, so
  // this mostly fires for tokens with liquidity that haven't traded recently).
  const ageMs = row.stats_updated_at ? Date.now() - new Date(row.stats_updated_at).getTime() : Infinity;
  if (row.price == null || ageMs > 600_000) {
    const computed = await computeTokenStats(address).catch(() => false);
    if (computed) result = await query(TOKEN_DETAIL_SQL, [config.CHAIN_ID, address]);
  }
  return result.rows[0];
});

// Recent trades for a token (either side), for the scan-page transaction feed.
app.get<{ Params: { address: string }; Querystring: { limit?: string; before?: string } }>(
  "/api/v1/tokens/:address/swaps",
  async (req) => {
    const address = requireAddress(req.params.address);
    const limit = Math.min(Number(req.query.limit) || 40, 200);
    const before = req.query.before ? Number(req.query.before) : null;
    const result = await query(
      `SELECT s.transaction_hash, s.log_index, s.wallet_address, s.dex, s.pool_address,
              s.usd_value, s.block_number, s.timestamp,
              CASE WHEN s.token_out = $2 THEN 'buy' ELSE 'sell' END AS side,
              (CASE WHEN s.token_out = $2 THEN s.amount_out ELSE s.amount_in END) AS token_amount
         FROM swaps s
        WHERE s.chain_id = $1 AND (s.token_in = $2 OR s.token_out = $2)
          AND ($3::bigint IS NULL OR s.block_number < $3)
        ORDER BY s.block_number DESC, s.log_index DESC
        LIMIT $4`,
      [config.CHAIN_ID, address, before, limit]
    );
    return { token: address, count: result.rows.length, swaps: result.rows };
  }
);

const DEAD_ADDRS = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
]);

// V4 is a singleton: every V4 pool's reserves live in the PoolManager
// contract itself, not at a per-pool address, so it isn't in `pools.address`
// and needs to be flagged as "pool" by hand — otherwise it shows up as a
// giant, misleading whale in the holder list for any V4-traded token.
const V4_SINGLETON_ADDRS = new Set(
  [contracts.uniswapV4PoolManager]
    .filter((a): a is `0x${string}` => typeof a === "string")
    .map((a) => a.toLowerCase())
);

type Grade = "A" | "B" | "C" | "D" | "E" | "F";
function gradeFor(score: number): Grade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  if (score >= 25) return "E";
  return "F";
}

// Holder concentration + a HoodScore grade, from the indexed transfer window.
// Balances are net (in - out) over transfers we've seen, so they're an estimate,
// not a full chain snapshot — the response says as much.
app.get<{ Params: { address: string } }>("/api/v1/tokens/:address/report", async (req, reply) => {
  const address = requireAddress(req.params.address);

  const [holdersRes, poolsRes, statsRes] = await Promise.all([
    query(
      `WITH deltas AS (
         SELECT to_address AS addr, amount::numeric AS d
           FROM token_transfers WHERE chain_id = $1 AND token_address = $2
         UNION ALL
         SELECT from_address AS addr, -amount::numeric AS d
           FROM token_transfers WHERE chain_id = $1 AND token_address = $2
       ),
       bal AS (SELECT addr, SUM(d) AS balance FROM deltas GROUP BY addr HAVING SUM(d) > 0),
       tot AS (SELECT COALESCE(SUM(balance), 0) AS supply, COUNT(*) AS holders FROM bal)
       SELECT b.addr, b.balance,
              (b.balance / NULLIF(t.supply, 0) * 100)::float8 AS pct,
              t.holders::int AS holder_count, t.supply AS tracked_supply,
              (SELECT COUNT(*) FROM token_transfers WHERE chain_id = $1 AND token_address = $2)::int AS transfer_count
         FROM bal b CROSS JOIN tot t
        ORDER BY b.balance DESC
        LIMIT 25`,
      [config.CHAIN_ID, address]
    ),
    query(
      `SELECT p.address, p.dex, ps.liquidity_usd, ps.volume_24h,
              t0.symbol AS sym0, t1.symbol AS sym1
         FROM pools p
         LEFT JOIN pair_statistics ps ON ps.chain_id = p.chain_id AND ps.pool_address = p.address
         LEFT JOIN tokens t0 ON t0.chain_id = p.chain_id AND t0.address = p.token0
         LEFT JOIN tokens t1 ON t1.chain_id = p.chain_id AND t1.address = p.token1
        WHERE p.chain_id = $1 AND (p.token0 = $2 OR p.token1 = $2)
        ORDER BY ps.liquidity_usd DESC NULLS LAST, ps.volume_24h DESC NULLS LAST
        LIMIT 8`,
      [config.CHAIN_ID, address]
    ),
    query(
      `SELECT liquidity_usd, price_confidence, buy_count_24h, sell_count_24h
         FROM token_statistics WHERE chain_id = $1 AND token_address = $2`,
      [config.CHAIN_ID, address]
    ),
  ]);

  const poolAddrs = new Set<string>([
    ...poolsRes.rows.map((p: { address: string }) => p.address.toLowerCase()),
    ...V4_SINGLETON_ADDRS,
  ]);
  const rows = holdersRes.rows as {
    addr: string;
    pct: number | null;
    holder_count: number;
    transfer_count: number;
  }[];
  const holderCount = rows[0]?.holder_count ?? 0;
  const transferCount = rows[0]?.transfer_count ?? 0;

  const top = rows.map((r) => {
    const a = r.addr.toLowerCase();
    return {
      address: r.addr,
      pct: r.pct ?? 0,
      is_pool: poolAddrs.has(a),
      is_burn: DEAD_ADDRS.has(a),
    };
  });
  const wallets = top.filter((h) => !h.is_pool && !h.is_burn);
  const top1 = wallets[0]?.pct ?? 0;
  const top10 = wallets.slice(0, 10).reduce((s, h) => s + h.pct, 0);
  const poolPct = top.filter((h) => h.is_pool).reduce((s, h) => s + h.pct, 0);

  const stats = statsRes.rows[0] as
    | { liquidity_usd: string | null; price_confidence: string | null }
    | undefined;
  const liq = stats?.liquidity_usd ? Number(stats.liquidity_usd) : 0;
  const conf = stats?.price_confidence ?? "low";

  let score = 100;
  const reasons: string[] = [];
  if (top1 > 50) { score -= 45; reasons.push(`One wallet holds ${top1.toFixed(1)}% of the tracked supply`); }
  else if (top1 > 30) { score -= 28; reasons.push(`Largest wallet holds ${top1.toFixed(1)}%`); }
  else if (top1 > 15) { score -= 14; reasons.push(`Largest wallet holds ${top1.toFixed(1)}%`); }
  else if (top1 > 6) { score -= 5; reasons.push(`Largest wallet holds ${top1.toFixed(1)}%`); }
  else reasons.push(`Largest wallet holds ${top1.toFixed(1)}%`);

  if (top10 > 80) { score -= 25; reasons.push(`Top 10 wallets hold ${top10.toFixed(1)}%`); }
  else if (top10 > 60) { score -= 15; reasons.push(`Top 10 wallets hold ${top10.toFixed(1)}%`); }
  else if (top10 > 40) { score -= 7; reasons.push(`Top 10 wallets hold ${top10.toFixed(1)}%`); }
  else reasons.push(`Top 10 wallets hold ${top10.toFixed(1)}%`);

  if (holderCount > 0 && holderCount < 25) { score -= 15; reasons.push(`Only ${holderCount} holders in the indexed window`); }
  else if (holderCount < 100) { score -= 6; reasons.push(`${holderCount} holders in the indexed window`); }
  else reasons.push(`${holderCount} holders in the indexed window`);

  if (liq > 0 && liq < 10_000) { score -= 20; reasons.push(`Thin liquidity (~$${Math.round(liq).toLocaleString("en-US")})`); }
  else if (liq < 50_000) { score -= 9; reasons.push(`Modest liquidity (~$${Math.round(liq).toLocaleString("en-US")})`); }
  else if (liq > 0) reasons.push(`Liquidity ~$${Math.round(liq).toLocaleString("en-US")}`);

  if (conf === "low") { score -= 10; reasons.push("Price confidence is low"); }
  else if (conf === "medium") { score -= 3; }

  if (transferCount === 0) {
    return reply.send({
      pools: poolsRes.rows,
      holders: null,
      hoodscore: null,
      note: "No transfers indexed for this token yet.",
    });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    pools: poolsRes.rows,
    holders: {
      count: holderCount,
      transfers: transferCount,
      top1_pct: top1,
      top10_pct: top10,
      pool_pct: poolPct,
      top: top.slice(0, 20),
    },
    hoodscore: { grade: gradeFor(score), score, reasons },
    note: "Balances are net over the indexed transfer window, not a full chain snapshot.",
  };
});

// HoodMap view — the holder bubble map. Clustering heuristic: a holder's
// "funder" is whoever sent its first-ever native-value transfer (every fresh
// wallet needs gas before it can do anything, DEX buy included). Two or more
// top holders sharing the same funder become one cluster — the classic signal
// for "one person/bot controls all of these," even though on-chain they read
// as unrelated holders. We say so plainly rather than claiming certainty:
// a shared funder is evidence, not proof (it could be a CEX withdrawal
// wallet coincidentally funding unrelated people).
app.get<{ Params: { address: string } }>("/api/v1/tokens/:address/map", async (req, reply) => {
  const address = requireAddress(req.params.address);
  const NODE_LIMIT = 80;

  const [holdersRes, poolsRes] = await Promise.all([
    query<{ addr: string; balance: string; pct: number | null; holder_count: number }>(
      `WITH deltas AS (
         SELECT to_address AS addr, amount::numeric AS d
           FROM token_transfers WHERE chain_id = $1 AND token_address = $2
         UNION ALL
         SELECT from_address AS addr, -amount::numeric AS d
           FROM token_transfers WHERE chain_id = $1 AND token_address = $2
       ),
       bal AS (SELECT addr, SUM(d) AS balance FROM deltas GROUP BY addr HAVING SUM(d) > 0),
       tot AS (SELECT COALESCE(SUM(balance), 0) AS supply, COUNT(*) AS holders FROM bal)
       SELECT b.addr, b.balance::text, (b.balance / NULLIF(t.supply, 0) * 100)::float8 AS pct,
              t.holders::int AS holder_count
         FROM bal b CROSS JOIN tot t
        ORDER BY b.balance DESC
        LIMIT $3`,
      [config.CHAIN_ID, address, NODE_LIMIT]
    ),
    query<{ address: string }>(
      `SELECT address FROM pools WHERE chain_id = $1 AND (token0 = $2 OR token1 = $2)`,
      [config.CHAIN_ID, address]
    ),
  ]);

  if (holdersRes.rows.length === 0) {
    return reply.send({ address, holderCount: 0, nodes: [], edges: [], clusters: [], note: "No transfers indexed for this token yet." });
  }

  const poolAddrs = new Set([
    ...poolsRes.rows.map((p) => p.address.toLowerCase()),
    ...V4_SINGLETON_ADDRS,
  ]);
  const holderCount = holdersRes.rows[0].holder_count;

  type HolderRow = { address: string; balance: string; pct: number; isPool: boolean; isBurn: boolean };
  const holders: HolderRow[] = holdersRes.rows.map((r) => {
    const a = r.addr.toLowerCase();
    return {
      address: a,
      balance: r.balance,
      pct: r.pct ?? 0,
      isPool: poolAddrs.has(a),
      isBurn: DEAD_ADDRS.has(a),
    };
  });

  // Only "real" wallets get traced to a funder — pools/burn addresses aren't people.
  const walletAddrs = holders.filter((h) => !h.isPool && !h.isBurn).map((h) => h.address);
  const excluded = [...poolAddrs, ...DEAD_ADDRS];

  // Two signals, strongest first:
  //  1. Someone handed them the token directly (not a DEX buy from the pool)
  //     — a dev/insider pre-distributing to alt wallets before launch is
  //     strong, direct evidence of common control.
  //  2. Whoever sent their first-ever native-value transfer — every fresh
  //     wallet needs gas before it can do anything (DEX buy included), so a
  //     shared gas source is evidence too, just weaker (it could coincide
  //     with an unrelated CEX withdrawal wallet).
  const [tokenFunderRes, nativeFunderRes] = walletAddrs.length
    ? await Promise.all([
        query<{ addr: string; funder: string | null }>(
          `SELECT h.addr, f.from_address AS funder
             FROM unnest($3::text[]) AS h(addr)
             LEFT JOIN LATERAL (
               SELECT from_address FROM token_transfers
                WHERE chain_id = $1 AND token_address = $2 AND to_address = h.addr
                  AND from_address <> ALL($4::text[])
                ORDER BY block_number ASC LIMIT 1
             ) f ON true`,
          [config.CHAIN_ID, address, walletAddrs, excluded]
        ),
        query<{ addr: string; funder: string | null }>(
          `SELECT h.addr, f.from_address AS funder
             FROM unnest($2::text[]) AS h(addr)
             LEFT JOIN LATERAL (
               SELECT from_address FROM transactions
                WHERE chain_id = $1 AND to_address = h.addr AND value > 0
                ORDER BY block_number ASC LIMIT 1
             ) f ON true`,
          [config.CHAIN_ID, walletAddrs]
        ),
      ])
    : [
        { rows: [] as { addr: string; funder: string | null }[] },
        { rows: [] as { addr: string; funder: string | null }[] },
      ];

  const tokenFunderByAddr = new Map<string, string>();
  for (const r of tokenFunderRes.rows) {
    if (r.funder && r.funder !== r.addr) tokenFunderByAddr.set(r.addr, r.funder);
  }
  const nativeFunderByAddr = new Map<string, string>();
  for (const r of nativeFunderRes.rows) {
    if (r.funder && r.funder !== r.addr) nativeFunderByAddr.set(r.addr, r.funder);
  }
  const funderByAddr = new Map<string, string>();
  const funderKindByAddr = new Map<string, "token" | "native">();
  for (const addr of walletAddrs) {
    const tf = tokenFunderByAddr.get(addr);
    const nf = nativeFunderByAddr.get(addr);
    if (tf) {
      funderByAddr.set(addr, tf);
      funderKindByAddr.set(addr, "token");
    } else if (nf) {
      funderByAddr.set(addr, nf);
      funderKindByAddr.set(addr, "native");
    }
  }

  // Group wallets by shared funder; only groups of 2+ count as a cluster.
  const byFunder = new Map<string, string[]>();
  for (const [addr, funder] of funderByAddr) {
    if (!byFunder.has(funder)) byFunder.set(funder, []);
    byFunder.get(funder)!.push(addr);
  }
  const holderByAddr = new Map(holders.map((h) => [h.address, h]));
  const clusters = [...byFunder.entries()]
    .filter(([, members]) => members.length >= 2)
    .map(([funder, members]) => ({
      id: funder,
      funder,
      members,
      memberCount: members.length,
      totalPct: members.reduce((s, m) => s + (holderByAddr.get(m)?.pct ?? 0), 0),
    }))
    .sort((a, b) => b.totalPct - a.totalPct);

  const clusteredAddrs = new Set(clusters.flatMap((c) => c.members));
  const clusterIdByAddr = new Map<string, string>();
  for (const c of clusters) for (const m of c.members) clusterIdByAddr.set(m, c.id);

  // Funders that aren't already a top holder still get drawn — dimmed, zero
  // balance — so a cluster's hub is visible even if it holds none of the
  // token itself (common: a wallet that only ever distributes gas).
  const funderOnlyAddrs = [...new Set(clusters.map((c) => c.funder))].filter(
    (f) => !holderByAddr.has(f)
  );

  const nodes = [
    ...holders.map((h) => ({
      address: h.address,
      balance: h.balance,
      pct: h.pct,
      isPool: h.isPool,
      isBurn: h.isBurn,
      isFunderOnly: false,
      funder: funderByAddr.get(h.address) ?? null,
      funderKind: funderKindByAddr.get(h.address) ?? null,
      clusterId: clusterIdByAddr.get(h.address) ?? null,
    })),
    ...funderOnlyAddrs.map((f) => ({
      address: f,
      balance: "0",
      pct: 0,
      isPool: false,
      isBurn: false,
      isFunderOnly: true,
      funder: null,
      funderKind: null,
      clusterId: f,
    })),
  ];

  const edges = [...clusteredAddrs].map((addr) => ({
    from: funderByAddr.get(addr)!,
    to: addr,
    kind: funderKindByAddr.get(addr)!,
  }));

  return {
    address,
    holderCount,
    clusteredPct: clusters.reduce((s, c) => s + c.totalPct, 0),
    nodes,
    edges,
    clusters,
    note: "Balances are net over the indexed transfer window. Clusters are wallets that share a first funder — evidence of common control, not proof.",
  };
});

// ---- DEX read layer ----
// Lists are driven by the precomputed token_statistics / pair_statistics tables
// (only traded entities land there), so they stay fast at chain scale.

app.get<{ Querystring: { limit?: string; sort?: string } }>("/api/v1/tokens", async (req) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const sortCol =
    req.query.sort === "liquidity" ? "ts.liquidity_usd" :
    req.query.sort === "fdv" ? "ts.fdv" :
    req.query.sort === "recent" ? "ts.last_trade_at" :
    "ts.volume_24h";
  // HoodMap only covers memecoins: excludes the wrapped native asset, the
  // house stablecoin, and Robinhood's own tokenized stocks/ETFs — see
  // classifyToken() in src/decode/entities.ts for how that's decided.
  const result = await query(
    `SELECT t.address, t.symbol, t.name, t.decimals, t.token_type, t.verified,
            ts.price, ts.price_native, ts.market_cap, ts.fdv, ts.liquidity_usd,
            ts.volume_24h, ts.volume_6h, ts.buy_count_24h, ts.sell_count_24h,
            ts.pool_count, ts.price_confidence, ts.last_trade_at
       FROM token_statistics ts
       JOIN tokens t ON t.chain_id = ts.chain_id AND t.address = ts.token_address
      WHERE ts.chain_id = $1 AND t.discovery_failed = false AND t.token_type = 'meme_token'
      ORDER BY ${sortCol} DESC NULLS LAST
      LIMIT $2`,
    [config.CHAIN_ID, limit]
  );
  return { count: result.rows.length, tokens: result.rows };
});

app.get<{ Querystring: { limit?: string } }>("/api/v1/pairs", async (req) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const result = await query(
    `SELECT p.address, p.dex, p.pool_type, p.fee_tier,
            t0.address AS token0, t0.symbol AS symbol0,
            t1.address AS token1, t1.symbol AS symbol1,
            ps.price0_usd, ps.price1_usd, ps.liquidity_usd, ps.volume_24h,
            ps.swap_count_24h, ps.buy_count_24h, ps.sell_count_24h, ps.updated_at
       FROM pair_statistics ps
       JOIN pools p   ON p.chain_id = ps.chain_id AND p.address = ps.pool_address
       JOIN tokens t0 ON t0.chain_id = $1 AND t0.address = p.token0
       JOIN tokens t1 ON t1.chain_id = $1 AND t1.address = p.token1
      WHERE ps.chain_id = $1
      ORDER BY ps.volume_24h DESC NULLS LAST, ps.liquidity_usd DESC NULLS LAST
      LIMIT $2`,
    [config.CHAIN_ID, limit]
  );
  return { count: result.rows.length, pairs: result.rows };
});

const PAIR_DETAIL_SQL = `
  SELECT p.*, t0.symbol AS symbol0, t0.decimals AS decimals0,
         t1.symbol AS symbol1, t1.decimals AS decimals1,
         ps.price0_in_1, ps.price0_usd, ps.price1_usd, ps.reserve0, ps.reserve1,
         ps.liquidity_usd, ps.volume_24h, ps.swap_count_24h,
         ps.buy_count_24h AS buys_24h, ps.sell_count_24h AS sells_24h, ps.updated_at AS stats_updated_at
    FROM pools p
    JOIN tokens t0 ON t0.chain_id = p.chain_id AND t0.address = p.token0
    JOIN tokens t1 ON t1.chain_id = p.chain_id AND t1.address = p.token1
    LEFT JOIN pair_statistics ps ON ps.chain_id = p.chain_id AND ps.pool_address = p.address
   WHERE p.chain_id = $1 AND p.address = $2`;

app.get<{ Params: { address: string } }>("/api/v1/pairs/:address", async (req, reply) => {
  const address = requirePoolRef(req.params.address);
  let result = await query(PAIR_DETAIL_SQL, [config.CHAIN_ID, address]);

  if (!result.rows[0]) {
    // Unknown pool — resolve it on-chain, then persist.
    const isPoolId = address.length === 66;
    const kp = isPoolId
      ? await fetchV4PoolKey(address as `0x${string}`).catch(() => null)
      : await identifyPool(address as `0x${string}`).catch(() => null);
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
    const address = requirePoolRef(req.params.address);
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
    liquidity_usd: string;
    weth_usd: string | null;
  }>(
    `SELECT
       (SELECT reltuples::bigint FROM pg_class WHERE relname = 'tokens') AS tokens,
       (SELECT reltuples::bigint FROM pg_class WHERE relname = 'pools')  AS pools,
       (SELECT COUNT(*)                     FROM swaps WHERE chain_id = $1 AND timestamp > now() - interval '24 hours') AS swaps_24h,
       (SELECT COUNT(DISTINCT wallet_address) FROM swaps WHERE chain_id = $1 AND timestamp > now() - interval '24 hours') AS active_wallets_24h,
       (SELECT COALESCE(SUM(usd_value), 0)  FROM swaps WHERE chain_id = $1 AND timestamp > now() - interval '24 hours') AS volume_24h,
       (SELECT COALESCE(SUM(liquidity_usd), 0) FROM pair_statistics WHERE chain_id = $1) AS liquidity_usd,
       (SELECT price FROM token_statistics WHERE chain_id = $1 AND token_address = $2) AS weth_usd`,
    [config.CHAIN_ID, contracts.weth]
  );
  const r = rows[0];
  return {
    tokens: Number(r.tokens),
    pools: Number(r.pools),
    swaps_24h: Number(r.swaps_24h),
    active_wallets_24h: Number(r.active_wallets_24h),
    volume_24h: r.volume_24h,
    liquidity_usd: r.liquidity_usd,
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
