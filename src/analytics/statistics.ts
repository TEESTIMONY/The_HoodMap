import { formatUnits, type Hex } from "viem";
import { query, withTransaction } from "../db/pool.js";
import { config } from "../config/index.js";
import { logger } from "../config/logger.js";
import { contracts, isStablecoin, isWeth } from "../dex/contracts.js";
import { readPoolReserves, valuePools } from "./poolState.js";
import type { KnownPool } from "../dex/adapter.js";

interface TokenRow {
  address: string;
  decimals: number | null;
  total_supply: string | null;
}

interface VolRow {
  token: string;
  vol_24h: string;
  vol_6h: string;
  vol_1h: string;
  buys_24h: string;
  sells_24h: string;
  last_trade_at: string | null;
}

/** Clamp to a sane range and to what the target NUMERIC column can hold.
 *  Anything out of range is almost certainly a bad price from a thin pool. */
function guardNum(n: number | null | undefined, max = 1e14): number | null {
  return n != null && Number.isFinite(n) && n >= 0 && n < max ? n : null;
}
const PRICE_MAX = 1e18; // NUMERIC(38,18)
const USD_MAX = 1e14; // NUMERIC(20,6) — volume/liquidity
const CAP_MAX = 1e17; // NUMERIC(24,6) — market_cap / fdv

async function loadTradedPools(): Promise<KnownPool[]> {
  const { rows } = await query<{
    address: string;
    dex: string;
    pool_type: string | null;
    token0: string;
    token1: string;
    fee_tier: string | null;
    factory: string | null;
  }>(
    `SELECT p.address, p.dex, p.pool_type, p.token0, p.token1, p.fee_tier, p.factory
       FROM pools p
      WHERE p.chain_id = $1
        AND EXISTS (SELECT 1 FROM swaps s WHERE s.chain_id = $1 AND s.pool_address = p.address)`,
    [config.CHAIN_ID]
  );
  return rows.map((r) => ({
    address: r.address as Hex,
    dex: r.dex,
    poolType: (r.pool_type as "v2" | "v3") ?? "v2",
    token0: r.token0 as Hex,
    token1: r.token1 as Hex,
    feeTier: r.fee_tier != null ? Number(r.fee_tier) : null,
    factory: (r.factory as Hex) ?? null,
  }));
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

/**
 * Recompute `token_statistics` + `pair_statistics` for every token/pool that has
 * traded: pool balances → USD valuation → per-token price/liquidity/FDV, plus
 * 1h/6h/24h volume and buy/sell counts from `swaps`.
 */
export async function refreshStatistics(): Promise<{ tokens: number; pools: number }> {
  const pools = await loadTradedPools();
  if (pools.length === 0) return { tokens: 0, pools: 0 };

  const tokenAddrs = [...new Set(pools.flatMap((p) => [p.token0, p.token1]))];
  const { rows: tokenRows } = await query<TokenRow>(
    `SELECT address, decimals, total_supply FROM tokens WHERE chain_id = $1 AND address = ANY($2)`,
    [config.CHAIN_ID, tokenAddrs]
  );
  const tokenMeta = new Map(tokenRows.map((r) => [r.address, r]));
  const decimalsOf = (a: string): number => tokenMeta.get(a.toLowerCase())?.decimals ?? 18;

  const reserves = await readPoolReserves(pools);

  // WETH/USD anchor: deepest WETH↔stable pool, else last such swap.
  let wethUsd: number | null = null;
  let bestStable = 0;
  for (const r of reserves) {
    const { token0, token1 } = r.pool;
    const a0 = Number(formatUnits(r.reserve0, decimalsOf(token0)));
    const a1 = Number(formatUnits(r.reserve1, decimalsOf(token1)));
    if (isWeth(token0) && isStablecoin(token1) && a1 > bestStable) {
      bestStable = a1;
      wethUsd = a0 > 0 ? a1 / a0 : wethUsd;
    } else if (isWeth(token1) && isStablecoin(token0) && a0 > bestStable) {
      bestStable = a0;
      wethUsd = a1 > 0 ? a0 / a1 : wethUsd;
    }
  }
  if (wethUsd == null) wethUsd = await lastWethUsdFromSwaps();

  const knownPrices = new Map<string, number>();
  const valuations = valuePools(reserves, decimalsOf, wethUsd, knownPrices);

  // Per-token aggregation from pool valuations.
  interface TokenAgg {
    price: number | null;
    priceFromLiq: number;
    liquidityUsd: number;
    poolCount: number;
  }
  const agg = new Map<string, TokenAgg>();
  const bump = (addr: string, sideUsd: number | null, tokenPrice: number | null, poolLiq: number | null) => {
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
    bump(v.pool.token0, v.side0Usd, v.price0Usd, v.liquidityUsd);
    bump(v.pool.token1, v.side1Usd, v.price1Usd, v.liquidityUsd);
  }

  // Volume + buy/sell from swaps, per token (a swap counts toward both sides).
  const { rows: volRows } = await query<VolRow>(
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
      GROUP BY token`,
    [config.CHAIN_ID]
  );
  const volByToken = new Map(volRows.map((r) => [r.token, r]));

  // Pool-level volume for pair_statistics.
  const { rows: poolVolRows } = await query<{
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
      WHERE s.chain_id = $1
      GROUP BY s.pool_address`,
    [config.CHAIN_ID]
  );
  const volByPool = new Map(poolVolRows.map((r) => [r.pool_address, r]));

  // ---- write ----
  let tokenCount = 0;
  await withTransaction(async (client) => {
    for (const [address, a] of agg) {
      const meta = tokenMeta.get(address);
      const price = guardNum(a.price, PRICE_MAX);
      const totalSupply = meta?.total_supply ? Number(formatUnits(BigInt(meta.total_supply), decimalsOf(address))) : null;
      const fdv = price != null && totalSupply != null ? guardNum(price * totalSupply, CAP_MAX) : null;
      const priceNative = price != null && wethUsd ? guardNum(price / wethUsd, PRICE_MAX) : null;
      const v = volByToken.get(address);
      const confidence =
        price == null ? "low" : a.liquidityUsd > 5_000 ? "high" : a.liquidityUsd > 250 ? "medium" : "low";

      await client.query(
        `INSERT INTO token_statistics
           (chain_id, token_address, price, price_native, market_cap, fdv, liquidity_usd,
            volume_24h, volume_6h, volume_1h, buy_count_24h, sell_count_24h,
            pool_count, total_supply, last_trade_at, price_confidence, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now())
         ON CONFLICT (chain_id, token_address) DO UPDATE SET
           price = EXCLUDED.price, price_native = EXCLUDED.price_native,
           market_cap = EXCLUDED.market_cap, fdv = EXCLUDED.fdv,
           liquidity_usd = EXCLUDED.liquidity_usd,
           volume_24h = EXCLUDED.volume_24h, volume_6h = EXCLUDED.volume_6h, volume_1h = EXCLUDED.volume_1h,
           buy_count_24h = EXCLUDED.buy_count_24h, sell_count_24h = EXCLUDED.sell_count_24h,
           pool_count = EXCLUDED.pool_count, total_supply = EXCLUDED.total_supply,
           last_trade_at = EXCLUDED.last_trade_at, price_confidence = EXCLUDED.price_confidence,
           updated_at = now()`,
        [
          config.CHAIN_ID,
          address,
          price,
          priceNative,
          // market_cap: we lack a circulating-supply feed, so use FDV as the
          // best available estimate (most RH-chain launches mint 100% to the
          // pool/deployer). Flagged via price_confidence.
          fdv,
          fdv,
          guardNum(a.liquidityUsd, USD_MAX),
          v?.vol_24h ?? 0,
          v?.vol_6h ?? 0,
          v?.vol_1h ?? 0,
          v ? Number(v.buys_24h) : 0,
          v ? Number(v.sells_24h) : 0,
          a.poolCount,
          meta?.total_supply ?? null,
          v?.last_trade_at ?? null,
          confidence,
        ]
      );
      tokenCount++;
    }

    for (const v of valuations) {
      const pv = volByPool.get(v.pool.address);
      const price0In1 = v.amount0 > 0 && v.amount1 > 0 ? guardNum(v.amount1 / v.amount0, PRICE_MAX) : null;
      await client.query(
        `INSERT INTO pair_statistics
           (chain_id, pool_address, price0_in_1, price0_usd, price1_usd, reserve0, reserve1,
            liquidity_usd, volume_24h, swap_count_24h, buy_count_24h, sell_count_24h, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
         ON CONFLICT (chain_id, pool_address) DO UPDATE SET
           price0_in_1 = EXCLUDED.price0_in_1, price0_usd = EXCLUDED.price0_usd,
           price1_usd = EXCLUDED.price1_usd, reserve0 = EXCLUDED.reserve0, reserve1 = EXCLUDED.reserve1,
           liquidity_usd = EXCLUDED.liquidity_usd, volume_24h = EXCLUDED.volume_24h,
           swap_count_24h = EXCLUDED.swap_count_24h, buy_count_24h = EXCLUDED.buy_count_24h,
           sell_count_24h = EXCLUDED.sell_count_24h, updated_at = now()`,
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
  });

  return { tokens: tokenCount, pools: valuations.length };
}
