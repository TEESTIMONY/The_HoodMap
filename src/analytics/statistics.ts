import { formatUnits, type Hex } from "viem";
import { query, withTransaction } from "../db/pool.js";
import type { PoolClient } from "pg";
import { config } from "../config/index.js";
import { contracts, isStablecoin, isWeth } from "../dex/contracts.js";
import { readPoolReserves, valuePools, type PoolValuation } from "./poolState.js";
import type { KnownPool } from "../dex/adapter.js";

/** Clamp to a sane range and to what the target NUMERIC column can hold —
 *  out-of-range means a garbage price from a thin pool. */
function guardNum(n: number | null | undefined, max: number): number | null {
  return n != null && Number.isFinite(n) && n >= 0 && n < max ? n : null;
}
const PRICE_MAX = 1e18; // NUMERIC(38,18)
const USD_MAX = 1e14; // NUMERIC(20,6) — volume / liquidity
const CAP_MAX = 1e17; // NUMERIC(24,6) — market_cap / fdv

interface PoolRow {
  address: string;
  dex: string;
  pool_type: string | null;
  token0: string;
  token1: string;
  fee_tier: string | null;
  factory: string | null;
}

function toKnownPool(r: PoolRow): KnownPool {
  return {
    address: r.address as Hex,
    dex: r.dex,
    poolType: (r.pool_type as "v2" | "v3") ?? "v2",
    token0: r.token0 as Hex,
    token1: r.token1 as Hex,
    feeTier: r.fee_tier != null ? Number(r.fee_tier) : null,
    factory: (r.factory as Hex) ?? null,
  };
}

async function lastWethUsdFromSwaps(): Promise<number | null> {
  if (!contracts.stablecoins.length) return null;
  const { rows } = await query<{ price: string }>(
    `SELECT price FROM swaps
      WHERE chain_id = $1 AND price IS NOT NULL
        AND ((token_in = $2 AND token_out = ANY($3)) OR (token_out = $2 AND token_in = ANY($3)))
      ORDER BY block_number DESC, log_index DESC LIMIT 1`,
    [config.CHAIN_ID, contracts.weth, contracts.stablecoins]
  );
  return rows[0] ? Number(rows[0].price) : null;
}

/** WETH/USD as a stable-liquidity-weighted average across every WETH↔stable pool
 *  in this reserve set — more stable than picking a single pool. */
function wethUsdFromReserves(
  reserves: { pool: KnownPool; reserve0: bigint; reserve1: bigint }[],
  decimalsOf: (a: string) => number
): number | null {
  let weightSum = 0;
  let weightedPx = 0;
  for (const r of reserves) {
    const a0 = Number(formatUnits(r.reserve0, decimalsOf(r.pool.token0)));
    const a1 = Number(formatUnits(r.reserve1, decimalsOf(r.pool.token1)));
    let px: number | null = null;
    let stable = 0;
    if (isWeth(r.pool.token0) && isStablecoin(r.pool.token1) && a0 > 0) {
      px = a1 / a0;
      stable = a1;
    } else if (isWeth(r.pool.token1) && isStablecoin(r.pool.token0) && a1 > 0) {
      px = a0 / a1;
      stable = a0;
    }
    if (px != null && px > 100 && px < 100_000 && stable > 100) {
      weightSum += stable;
      weightedPx += px * stable;
    }
  }
  return weightSum > 0 ? weightedPx / weightSum : null;
}

async function loadTokenMeta(addresses: string[]): Promise<Map<string, { decimals: number | null; total_supply: string | null }>> {
  const { rows } = await query<{ address: string; decimals: number | null; total_supply: string | null }>(
    `SELECT address, decimals, total_supply FROM tokens WHERE chain_id = $1 AND address = ANY($2)`,
    [config.CHAIN_ID, addresses]
  );
  return new Map(rows.map((r) => [r.address, { decimals: r.decimals, total_supply: r.total_supply }]));
}

interface TokenAgg {
  price: number | null;
  priceFromLiq: number;
  liquidityUsd: number;
  poolCount: number;
}

function aggregateTokens(valuations: PoolValuation[]): Map<string, TokenAgg> {
  const agg = new Map<string, TokenAgg>();
  const bump = (addr: string, tokenPrice: number | null, poolLiq: number | null) => {
    const a = agg.get(addr) ?? { price: null, priceFromLiq: 0, liquidityUsd: 0, poolCount: 0 };
    a.poolCount++;
    if (poolLiq != null) a.liquidityUsd += poolLiq;
    if (tokenPrice != null && poolLiq != null && poolLiq > a.priceFromLiq) {
      a.priceFromLiq = poolLiq;
      a.price = tokenPrice;
    }
    agg.set(addr, a);
  };
  for (const v of valuations) {
    bump(v.pool.token0, v.price0Usd, v.liquidityUsd);
    bump(v.pool.token1, v.price1Usd, v.liquidityUsd);
  }
  return agg;
}

async function upsertTokenStats(
  client: PoolClient,
  address: string,
  a: TokenAgg,
  meta: { decimals: number | null; total_supply: string | null } | undefined,
  wethUsd: number | null,
  vol: { vol_24h: string; vol_6h: string; vol_1h: string; buys_24h: string; sells_24h: string; last_trade_at: string | null } | undefined
): Promise<void> {
  const decimals = meta?.decimals ?? 18;
  const liquidity = guardNum(a.liquidityUsd, USD_MAX);
  // Only trust a price that came from a pool with real TVL.
  const price = liquidity != null && a.priceFromLiq >= 1 ? guardNum(a.price, PRICE_MAX) : null;
  const supply = meta?.total_supply ? Number(formatUnits(BigInt(meta.total_supply), decimals)) : null;
  const fdv = price != null && supply != null ? guardNum(price * supply, CAP_MAX) : null;
  const priceNative = price != null && wethUsd ? guardNum(price / wethUsd, PRICE_MAX) : null;
  const confidence =
    price == null ? "low"
    : (liquidity ?? 0) > 25_000 ? "high"
    : (liquidity ?? 0) > 1_000 ? "medium"
    : "low";

  await client.query(
    `INSERT INTO token_statistics
       (chain_id, token_address, price, price_native, market_cap, fdv, liquidity_usd,
        volume_24h, volume_6h, volume_1h, buy_count_24h, sell_count_24h,
        pool_count, total_supply, last_trade_at, price_confidence, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now())
     ON CONFLICT (chain_id, token_address) DO UPDATE SET
       price = EXCLUDED.price, price_native = EXCLUDED.price_native,
       market_cap = EXCLUDED.market_cap, fdv = EXCLUDED.fdv, liquidity_usd = EXCLUDED.liquidity_usd,
       volume_24h = EXCLUDED.volume_24h, volume_6h = EXCLUDED.volume_6h, volume_1h = EXCLUDED.volume_1h,
       buy_count_24h = EXCLUDED.buy_count_24h, sell_count_24h = EXCLUDED.sell_count_24h,
       pool_count = EXCLUDED.pool_count, total_supply = EXCLUDED.total_supply,
       last_trade_at = COALESCE(EXCLUDED.last_trade_at, token_statistics.last_trade_at),
       price_confidence = EXCLUDED.price_confidence, updated_at = now()`,
    [
      config.CHAIN_ID,
      address,
      price,
      priceNative,
      // market_cap: no circulating-supply feed, so FDV is the best estimate
      // (most RH-chain launches mint 100% to the pool). Flagged via confidence.
      fdv,
      fdv,
      liquidity,
      vol?.vol_24h ?? 0,
      vol?.vol_6h ?? 0,
      vol?.vol_1h ?? 0,
      vol ? Number(vol.buys_24h) : 0,
      vol ? Number(vol.sells_24h) : 0,
      a.poolCount,
      meta?.total_supply ?? null,
      vol?.last_trade_at ?? null,
      confidence,
    ]
  );
}

async function upsertPairStats(
  client: PoolClient,
  v: PoolValuation,
  pv: { vol_24h: string; swap_count_24h: string; buys_24h: string; sells_24h: string } | undefined
): Promise<void> {
  const price0In1 = v.amount0 > 0 && v.amount1 > 0 ? guardNum(v.amount1 / v.amount0, PRICE_MAX) : null;
  await client.query(
    `INSERT INTO pair_statistics
       (chain_id, pool_address, price0_in_1, price0_usd, price1_usd, reserve0, reserve1,
        liquidity_usd, volume_24h, swap_count_24h, buy_count_24h, sell_count_24h, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
     ON CONFLICT (chain_id, pool_address) DO UPDATE SET
       price0_in_1 = EXCLUDED.price0_in_1, price0_usd = EXCLUDED.price0_usd, price1_usd = EXCLUDED.price1_usd,
       reserve0 = EXCLUDED.reserve0, reserve1 = EXCLUDED.reserve1, liquidity_usd = EXCLUDED.liquidity_usd,
       volume_24h = EXCLUDED.volume_24h, swap_count_24h = EXCLUDED.swap_count_24h,
       buy_count_24h = EXCLUDED.buy_count_24h, sell_count_24h = EXCLUDED.sell_count_24h, updated_at = now()`,
    [
      config.CHAIN_ID,
      v.pool.address,
      price0In1,
      guardNum(v.price0Usd, PRICE_MAX),
      guardNum(v.price1Usd, PRICE_MAX),
      v.reserve0.toString(),
      v.reserve1.toString(),
      guardNum(v.liquidityUsd, USD_MAX),
      pv?.vol_24h ?? 0,
      pv ? Number(pv.swap_count_24h) : 0,
      pv ? Number(pv.buys_24h) : 0,
      pv ? Number(pv.sells_24h) : 0,
    ]
  );
}

async function tokenVolumes(tokens: string[] | null): Promise<
  Map<string, { vol_24h: string; vol_6h: string; vol_1h: string; buys_24h: string; sells_24h: string; last_trade_at: string | null }>
> {
  const filter = tokens ? `AND token = ANY($2)` : "";
  const params: unknown[] = tokens ? [config.CHAIN_ID, tokens] : [config.CHAIN_ID];
  const { rows } = await query<{
    token: string;
    vol_24h: string;
    vol_6h: string;
    vol_1h: string;
    buys_24h: string;
    sells_24h: string;
    last_trade_at: string | null;
  }>(
    `SELECT token,
            COALESCE(SUM(usd_value) FILTER (WHERE ts > now() - interval '24 hours'), 0) AS vol_24h,
            COALESCE(SUM(usd_value) FILTER (WHERE ts > now() - interval '6 hours'), 0)  AS vol_6h,
            COALESCE(SUM(usd_value) FILTER (WHERE ts > now() - interval '1 hour'), 0)   AS vol_1h,
            COUNT(*) FILTER (WHERE side = 'buy'  AND ts > now() - interval '24 hours') AS buys_24h,
            COUNT(*) FILTER (WHERE side = 'sell' AND ts > now() - interval '24 hours') AS sells_24h,
            MAX(ts) AS last_trade_at
       FROM (
         SELECT token_out AS token, usd_value, timestamp AS ts, 'buy'  AS side FROM swaps WHERE chain_id = $1
         UNION ALL
         SELECT token_in  AS token, usd_value, timestamp AS ts, 'sell' AS side FROM swaps WHERE chain_id = $1
       ) e
      WHERE true ${filter}
      GROUP BY token`,
    params
  );
  return new Map(rows.map((r) => [r.token, r]));
}

async function poolVolumes(pools: string[] | null): Promise<
  Map<string, { vol_24h: string; swap_count_24h: string; buys_24h: string; sells_24h: string }>
> {
  const filter = pools ? `AND s.pool_address = ANY($2)` : "";
  const params: unknown[] = pools ? [config.CHAIN_ID, pools] : [config.CHAIN_ID];
  const { rows } = await query<{
    pool_address: string;
    vol_24h: string;
    swap_count_24h: string;
    buys_24h: string;
    sells_24h: string;
  }>(
    `SELECT s.pool_address,
            COALESCE(SUM(usd_value) FILTER (WHERE timestamp > now() - interval '24 hours'), 0) AS vol_24h,
            COUNT(*) FILTER (WHERE timestamp > now() - interval '24 hours') AS swap_count_24h,
            COUNT(*) FILTER (WHERE timestamp > now() - interval '24 hours' AND token_out = pl.token0) AS buys_24h,
            COUNT(*) FILTER (WHERE timestamp > now() - interval '24 hours' AND token_in  = pl.token0) AS sells_24h
       FROM swaps s
       JOIN pools pl ON pl.chain_id = s.chain_id AND pl.address = s.pool_address
      WHERE s.chain_id = $1 ${filter}
      GROUP BY s.pool_address`,
    params
  );
  return new Map(rows.map((r) => [r.pool_address, r]));
}

/** Core: given a pool set, value them and persist token + pair statistics.
 *  `targetTokens` null ⇒ every token in the set; otherwise just those. */
async function computeForPools(pools: KnownPool[], targetTokens: string[] | null): Promise<number> {
  if (pools.length === 0) return 0;

  const tokenAddrs = [...new Set(pools.flatMap((p) => [p.token0, p.token1]))];
  const meta = await loadTokenMeta(tokenAddrs);
  const decimalsOf = (a: string) => meta.get(a.toLowerCase())?.decimals ?? 18;

  const reserves = await readPoolReserves(pools);
  let wethUsd = wethUsdFromReserves(reserves, decimalsOf);
  if (wethUsd == null) {
    const { rows } = await query<{ price: string }>(
      `SELECT price FROM token_statistics WHERE chain_id = $1 AND token_address = $2 AND price IS NOT NULL`,
      [config.CHAIN_ID, contracts.weth]
    );
    wethUsd = rows[0] ? Number(rows[0].price) : await lastWethUsdFromSwaps();
  }

  // Seed known prices from existing stats so a single-token recompute can still
  // price a TOKEN_A/TOKEN_B pool where B was priced elsewhere.
  const knownPrices = new Map<string, number>();
  const { rows: priced } = await query<{ token_address: string; price: string }>(
    `SELECT token_address, price FROM token_statistics
      WHERE chain_id = $1 AND price IS NOT NULL AND token_address = ANY($2)`,
    [config.CHAIN_ID, tokenAddrs]
  );
  for (const p of priced) knownPrices.set(p.token_address, Number(p.price));

  const valuations = valuePools(reserves, decimalsOf, wethUsd, knownPrices);
  const agg = aggregateTokens(valuations);

  const wantTokens = targetTokens ? new Set(targetTokens.map((t) => t.toLowerCase())) : null;
  const volTokens = await tokenVolumes(targetTokens);
  const volPools = await poolVolumes(targetTokens ? pools.map((p) => p.address) : null);

  let n = 0;
  await withTransaction(async (client) => {
    for (const [address, a] of agg) {
      if (wantTokens && !wantTokens.has(address)) continue;
      await upsertTokenStats(client, address, a, meta.get(address), wethUsd, volTokens.get(address));
      n++;
    }
    for (const v of valuations) {
      await upsertPairStats(client, v, volPools.get(v.pool.address));
    }
  });
  return n;
}

/**
 * Full refresh: recompute statistics for every token/pool that has traded.
 * Runs on the 45s worker loop.
 */
export async function refreshStatistics(): Promise<{ tokens: number; pools: number }> {
  const { rows } = await query<PoolRow>(
    `SELECT p.address, p.dex, p.pool_type, p.token0, p.token1, p.fee_tier, p.factory
       FROM pools p
      WHERE p.chain_id = $1
        AND EXISTS (SELECT 1 FROM swaps s WHERE s.chain_id = $1 AND s.pool_address = p.address)`,
    [config.CHAIN_ID]
  );
  const pools = rows.map(toKnownPool);
  const tokens = await computeForPools(pools, null);
  return { tokens, pools: pools.length };
}

/**
 * On-demand: compute statistics for one token from its own pools (bounded).
 * Lets the API show price/liquidity/FDV for any token with pooled liquidity,
 * without waiting for the worker or for the token to trade. Returns false if
 * the token has no pools.
 */
export async function computeTokenStats(address: string): Promise<boolean> {
  const addr = address.toLowerCase();
  const { rows } = await query<PoolRow>(
    `SELECT p.address, p.dex, p.pool_type, p.token0, p.token1, p.fee_tier, p.factory
       FROM pools p
      WHERE p.chain_id = $1 AND (p.token0 = $2 OR p.token1 = $2)
      ORDER BY p.created_block DESC NULLS LAST
      LIMIT 80`,
    [config.CHAIN_ID, addr]
  );
  if (rows.length === 0) return false;
  await computeForPools(rows.map(toKnownPool), [addr]);
  return true;
}
