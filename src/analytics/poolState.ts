import { formatUnits, parseAbi, type Hex } from "viem";
import { httpClient } from "../indexer/rpcClient.js";
import { contracts, isStablecoin, isWeth } from "../dex/contracts.js";
import { mapWithConcurrency } from "../lib/concurrency.js";
import type { KnownPool } from "../dex/adapter.js";

const BALANCE_OF = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const MULTICALL_CHUNK = 100;

export interface PoolReserves {
  pool: KnownPool;
  reserve0: bigint;
  reserve1: bigint;
}

export interface PoolValuation extends PoolReserves {
  /** Human (decimal-adjusted) reserve amounts. */
  amount0: number;
  amount1: number;
  /** USD value of each side, when derivable. */
  side0Usd: number | null;
  side1Usd: number | null;
  /** Full pool TVL in USD (sum of both sides; a one-sided value is doubled). */
  liquidityUsd: number | null;
  /** USD spot price of each token, from this pool. */
  price0Usd: number | null;
  price1Usd: number | null;
}

export interface DecimalsLookup {
  (address: string): number;
}

/**
 * Read token0/token1 balances of each pool contract. Works for Uniswap V2 and
 * V3 alike — a V3 pool holds its liquidity as plain token balances too.
 */
export async function readPoolReserves(pools: KnownPool[]): Promise<PoolReserves[]> {
  const calls = pools.flatMap((p) => [
    { address: p.token0, abi: BALANCE_OF, functionName: "balanceOf" as const, args: [p.address] as const },
    { address: p.token1, abi: BALANCE_OF, functionName: "balanceOf" as const, args: [p.address] as const },
  ]);

  const results: { status: "success" | "failure"; result?: unknown }[] = [];
  for (let i = 0; i < calls.length; i += MULTICALL_CHUNK * 2) {
    const chunk = calls.slice(i, i + MULTICALL_CHUNK * 2);
    try {
      const r = (await httpClient.multicall({
        contracts: chunk,
        allowFailure: true,
        multicallAddress: contracts.multicall3,
      })) as typeof results;
      results.push(...r);
    } catch {
      const r = await mapWithConcurrency(chunk, 8, async (c) => {
        try {
          return { status: "success" as const, result: await httpClient.readContract(c) };
        } catch {
          return { status: "failure" as const };
        }
      });
      results.push(...r);
    }
  }

  return pools.map((pool, i) => {
    const b0 = results[i * 2];
    const b1 = results[i * 2 + 1];
    return {
      pool,
      reserve0: b0?.status === "success" ? (b0.result as bigint) : 0n,
      reserve1: b1?.status === "success" ? (b1.result as bigint) : 0n,
    };
  });
}

/**
 * Value pools in USD. Two passes:
 *   1. pools with a stablecoin or WETH side get valued directly
 *   2. remaining pools where the *other* side's token now has a known price
 * `knownPrices` is seeded/updated in place so callers can read final prices out.
 */
export function valuePools(
  reserves: PoolReserves[],
  decimalsOf: DecimalsLookup,
  wethUsd: number | null,
  knownPrices: Map<string, number>
): PoolValuation[] {
  const out = new Map<string, PoolValuation>();

  const base = (r: PoolReserves): PoolValuation => {
    const d0 = decimalsOf(r.pool.token0);
    const d1 = decimalsOf(r.pool.token1);
    return {
      ...r,
      amount0: Number(formatUnits(r.reserve0, d0)),
      amount1: Number(formatUnits(r.reserve1, d1)),
      side0Usd: null,
      side1Usd: null,
      liquidityUsd: null,
      price0Usd: null,
      price1Usd: null,
    };
  };

  // Sanity bounds: no real pool holds $500B TVL; no real token is worth $100M
  // a unit. A near-empty pool against a valued asset produces exactly this kind
  // of garbage, so reject the whole valuation rather than emit a fake price.
  const MAX_POOL_TVL = 5e11;
  const MAX_UNIT_PRICE = 1e8;
  const MIN_POOL_TVL = 1; // ignore dust pools entirely

  const finalize = (v: PoolValuation): void => {
    if (v.side0Usd != null && v.side1Usd == null) v.side1Usd = v.side0Usd;
    if (v.side1Usd != null && v.side0Usd == null) v.side0Usd = v.side1Usd;
    if (v.side0Usd == null || v.side1Usd == null) return;

    const tvl = v.side0Usd + v.side1Usd;
    const p0 = v.amount0 > 0 ? v.side0Usd / v.amount0 : null;
    const p1 = v.amount1 > 0 ? v.side1Usd / v.amount1 : null;

    const sane =
      Number.isFinite(tvl) &&
      tvl >= MIN_POOL_TVL &&
      tvl <= MAX_POOL_TVL &&
      (p0 == null || (Number.isFinite(p0) && p0 > 0 && p0 <= MAX_UNIT_PRICE)) &&
      (p1 == null || (Number.isFinite(p1) && p1 > 0 && p1 <= MAX_UNIT_PRICE));
    if (!sane) {
      v.side0Usd = null;
      v.side1Usd = null;
      return;
    }

    v.liquidityUsd = tvl;
    v.price0Usd = p0;
    v.price1Usd = p1;
    if (p0 && p0 > 0) knownPrices.set(v.pool.token0, p0);
    if (p1 && p1 > 0) knownPrices.set(v.pool.token1, p1);
  };

  const valueSide = (token: string, amount: number): number | null => {
    if (isStablecoin(token)) return amount;
    if (isWeth(token) && wethUsd) return amount * wethUsd;
    const p = knownPrices.get(token.toLowerCase());
    return p ? amount * p : null;
  };

  // Pass 1: direct quote sides
  for (const r of reserves) {
    const v = base(r);
    v.side0Usd = valueSide(r.pool.token0, v.amount0);
    v.side1Usd = valueSide(r.pool.token1, v.amount1);
    if (v.side0Usd != null || v.side1Usd != null) finalize(v);
    out.set(r.pool.address, v);
  }
  // Pass 2: propagate through tokens priced in pass 1
  for (const v of out.values()) {
    if (v.liquidityUsd != null) continue;
    v.side0Usd = valueSide(v.pool.token0, v.amount0);
    v.side1Usd = valueSide(v.pool.token1, v.amount1);
    if (v.side0Usd != null || v.side1Usd != null) finalize(v);
  }

  return [...out.values()];
}
