import { formatUnits, parseAbi, type Hex } from "viem";
import { httpClient } from "../indexer/rpcClient.js";
import { contracts, isStablecoin, isWeth } from "../dex/contracts.js";
import { mapWithConcurrency } from "../lib/concurrency.js";
import type { KnownPool } from "../dex/adapter.js";

const BALANCE_OF = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const SLOT0 = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 a, uint16 b, uint16 c, uint8 d, bool e)",
]);
const V4_STATE = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)",
]);
const MULTICALL_CHUNK = 120;
const Q96 = 2 ** 96;
const Q96n = 2n ** 96n;

export interface PoolState {
  pool: KnownPool;
  /** token0/token1 balances held by the pool contract (V2 reserves, or V3 TVL). */
  reserve0: bigint;
  reserve1: bigint;
  /** V3 spot from slot0; null for V2. */
  sqrtPriceX96: bigint | null;
}

export interface PoolValuation extends PoolState {
  amount0: number;
  amount1: number;
  side0Usd: number | null;
  side1Usd: number | null;
  liquidityUsd: number | null;
  price0Usd: number | null;
  price1Usd: number | null;
}

export interface DecimalsLookup {
  (address: string): number;
}

type CallResult = { status: "success" | "failure"; result?: unknown };

async function multicallChunked(calls: unknown[]): Promise<CallResult[]> {
  const out: CallResult[] = [];
  for (let i = 0; i < calls.length; i += MULTICALL_CHUNK) {
    const chunk = calls.slice(i, i + MULTICALL_CHUNK);
    try {
      out.push(
        ...((await httpClient.multicall({
          contracts: chunk as never,
          allowFailure: true,
          multicallAddress: contracts.multicall3,
        })) as CallResult[])
      );
    } catch {
      out.push(
        ...(await mapWithConcurrency(chunk, 8, async (c) => {
          try {
            return { status: "success" as const, result: await httpClient.readContract(c as never) };
          } catch {
            return { status: "failure" as const };
          }
        }))
      );
    }
  }
  return out;
}

/**
 * Read each pool's token balances, plus `slot0()` for V3 pools (their spot price
 * lives there, not in the balance ratio — concentrated liquidity).
 */
export async function readPoolStates(pools: KnownPool[]): Promise<PoolState[]> {
  const nonV4 = pools.map((p, i) => ({ p, i })).filter((x) => x.p.poolType !== "v4");
  const v4 = pools.map((p, i) => ({ p, i })).filter((x) => x.p.poolType === "v4");
  const sv = contracts.uniswapV4StateView;

  // V2/V3: balanceOf both tokens; V3 also slot0().
  const balCalls = nonV4.flatMap(({ p }) => [
    { address: p.token0, abi: BALANCE_OF, functionName: "balanceOf", args: [p.address] },
    { address: p.token1, abi: BALANCE_OF, functionName: "balanceOf", args: [p.address] },
  ]);
  const v3 = nonV4.filter((x) => x.p.poolType === "v3");
  const slotCalls = v3.map(({ p }) => ({ address: p.address, abi: SLOT0, functionName: "slot0" }));

  // V4: getSlot0 + getLiquidity on StateView, keyed by PoolId.
  const v4Calls =
    sv && v4.length
      ? v4.flatMap(({ p }) => [
          { address: sv, abi: V4_STATE, functionName: "getSlot0", args: [p.address] },
          { address: sv, abi: V4_STATE, functionName: "getLiquidity", args: [p.address] },
        ])
      : [];

  const [bals, slots, v4res] = await Promise.all([
    balCalls.length ? multicallChunked(balCalls) : Promise.resolve([] as CallResult[]),
    slotCalls.length ? multicallChunked(slotCalls) : Promise.resolve([] as CallResult[]),
    v4Calls.length ? multicallChunked(v4Calls) : Promise.resolve([] as CallResult[]),
  ]);

  const bySqrt = new Map<number, bigint>();
  v3.forEach(({ i }, k) => {
    const res = slots[k];
    if (res?.status !== "success") return;
    const arr = res.result as unknown;
    const v = Array.isArray(arr) ? arr[0] : (arr as { sqrtPriceX96?: bigint }).sqrtPriceX96;
    if (typeof v === "bigint" && v > 0n) bySqrt.set(i, v);
  });

  const byReserve = new Map<number, { r0: bigint; r1: bigint }>();
  nonV4.forEach(({ i }, k) => {
    const b0 = bals[k * 2];
    const b1 = bals[k * 2 + 1];
    byReserve.set(i, {
      r0: b0?.status === "success" ? (b0.result as bigint) : 0n,
      r1: b1?.status === "success" ? (b1.result as bigint) : 0n,
    });
  });

  const v4State = new Map<number, { sqrt: bigint; r0: bigint; r1: bigint }>();
  v4.forEach(({ i, p }, k) => {
    const s0 = v4res[k * 2];
    const lq = v4res[k * 2 + 1];
    if (s0?.status !== "success") return;
    const arr = s0.result as unknown;
    const sqrt = Array.isArray(arr) ? (arr[0] as bigint) : (arr as { sqrtPriceX96: bigint }).sqrtPriceX96;
    const L = lq?.status === "success" ? (lq.result as bigint) : 0n;
    if (typeof sqrt !== "bigint" || sqrt <= 0n) return;
    // Estimate token amounts held at the current price (assumes liquidity at
    // the active tick — a reasonable proxy for TVL of concentrated V4 pools).
    const amount0 = L > 0n ? (L * Q96n) / sqrt : 0n;
    const amount1 = L > 0n ? (L * sqrt) / Q96n : 0n;
    v4State.set(i, { sqrt, r0: amount0, r1: amount1 });
    void p;
  });

  return pools.map((pool, i) => {
    if (pool.poolType === "v4") {
      const s = v4State.get(i);
      return { pool, reserve0: s?.r0 ?? 0n, reserve1: s?.r1 ?? 0n, sqrtPriceX96: s?.sqrt ?? null };
    }
    const res = byReserve.get(i) ?? { r0: 0n, r1: 0n };
    return { pool, reserve0: res.r0, reserve1: res.r1, sqrtPriceX96: bySqrt.get(i) ?? null };
  });
}

/** Backwards-compatible alias — returns the balance fields only. */
export async function readPoolReserves(pools: KnownPool[]): Promise<PoolState[]> {
  return readPoolStates(pools);
}

/** Spot price of token1 per token0 (human units). V3 from sqrtPriceX96, V2 from
 *  the reserve ratio. Null when it can't be determined. */
function spotToken1PerToken0(v: PoolState, d0: number, d1: number, a0: number, a1: number): number | null {
  if (v.sqrtPriceX96) {
    // (sqrtP / 2^96)^2 = token1_wei per token0_wei
    const r = Number(v.sqrtPriceX96) / Q96;
    const rawPrice = r * r;
    const p = rawPrice * 10 ** d0 / 10 ** d1;
    return Number.isFinite(p) && p > 0 ? p : null;
  }
  return a0 > 0 && a1 > 0 ? a1 / a0 : null;
}

/**
 * Value pools in USD. For each pool we take the spot price (V3: slot0, V2:
 * reserves) and anchor it against whichever side is a known quote asset
 * (stablecoin, WETH, or a token priced in an earlier pass). TVL is the USD sum
 * of the actual balances. Two passes so TOKEN_A/TOKEN_B pools resolve once A is
 * priced via A/quote.
 */
export function valuePools(
  states: PoolState[],
  decimalsOf: DecimalsLookup,
  wethUsd: number | null,
  knownPrices: Map<string, number>
): PoolValuation[] {
  const MAX_POOL_TVL = 5e11;
  const MAX_UNIT_PRICE = 1e8;
  const MIN_POOL_TVL = 1;

  const quoteUsd = (token: string): number | null => {
    if (isStablecoin(token)) return 1;
    if (isWeth(token) && wethUsd) return wethUsd;
    return knownPrices.get(token.toLowerCase()) ?? null;
  };

  const out: PoolValuation[] = states.map((s) => {
    const d0 = decimalsOf(s.pool.token0);
    const d1 = decimalsOf(s.pool.token1);
    return {
      ...s,
      amount0: Number(formatUnits(s.reserve0, d0)),
      amount1: Number(formatUnits(s.reserve1, d1)),
      side0Usd: null,
      side1Usd: null,
      liquidityUsd: null,
      price0Usd: null,
      price1Usd: null,
    };
  });

  const resolve = (v: PoolValuation): void => {
    if (v.price0Usd != null && v.price1Usd != null) return;
    const d0 = decimalsOf(v.pool.token0);
    const d1 = decimalsOf(v.pool.token1);
    const spot = spotToken1PerToken0(v, d0, d1, v.amount0, v.amount1); // token1 per token0
    const q0 = quoteUsd(v.pool.token0);
    const q1 = quoteUsd(v.pool.token1);

    let p0 = q0; // USD price of token0
    let p1 = q1; // USD price of token1
    if (spot && spot > 0) {
      if (p0 == null && p1 != null) p0 = p1 * spot;
      if (p1 == null && p0 != null) p1 = p0 / spot;
    }
    if (p0 == null || p1 == null) return;

    const tvl = v.amount0 * p0 + v.amount1 * p1;
    const sane =
      Number.isFinite(tvl) &&
      tvl >= MIN_POOL_TVL &&
      tvl <= MAX_POOL_TVL &&
      Number.isFinite(p0) && p0 > 0 && p0 <= MAX_UNIT_PRICE &&
      Number.isFinite(p1) && p1 > 0 && p1 <= MAX_UNIT_PRICE;
    if (!sane) return;

    v.price0Usd = p0;
    v.price1Usd = p1;
    v.side0Usd = v.amount0 * p0;
    v.side1Usd = v.amount1 * p1;
    v.liquidityUsd = tvl;
    knownPrices.set(v.pool.token0, p0);
    knownPrices.set(v.pool.token1, p1);
  };

  for (const v of out) resolve(v);
  for (const v of out) resolve(v); // second pass for token/token pools

  return out;
}
