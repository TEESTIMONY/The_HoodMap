import { test } from "node:test";
import assert from "node:assert/strict";
import { valuePools, type PoolState } from "./poolState.js";
import { contracts } from "../dex/contracts.js";
import type { KnownPool } from "../dex/adapter.js";

const STABLE = contracts.stablecoins[0] ?? "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH = contracts.weth;
const TOKEN = "0x1111111111111111111111111111111111111111" as const;
const TOKEN_B = "0x2222222222222222222222222222222222222222" as const;

function pool(t0: string, t1: string, poolType: "v2" | "v3" = "v2"): KnownPool {
  return {
    address: ("0x" + "ab".repeat(20)) as `0x${string}`,
    dex: poolType === "v3" ? "uniswap_v3" : "uniswap_v2",
    poolType,
    token0: t0 as `0x${string}`,
    token1: t1 as `0x${string}`,
    feeTier: poolType === "v3" ? 10000 : null,
    factory: null,
  };
}
const dec = (a: string) => (a.toLowerCase() === STABLE.toLowerCase() ? 6 : 18);
const wei = (n: number, d = 18) =>
  BigInt(Math.round(n * 10 ** Math.min(d, 9))) * 10n ** BigInt(Math.max(0, d - 9));

const v2 = (p: KnownPool, r0: bigint, r1: bigint): PoolState => ({
  pool: p,
  reserve0: r0,
  reserve1: r1,
  sqrtPriceX96: null,
});

test("V2: prices a token directly against a stablecoin from reserves", () => {
  const [v] = valuePools([v2(pool(TOKEN, STABLE), wei(1000), wei(2000, 6))], dec, 3000, new Map());
  assert.ok(v.price0Usd);
  assert.equal(Math.round(v.price0Usd), 2); // 2000 USDG / 1000 TOKEN
  assert.equal(Math.round(v.liquidityUsd ?? 0), 4000);
});

test("V2: propagates price through WETH in the second pass", () => {
  const vals = valuePools(
    [
      v2(pool(WETH, STABLE), wei(10), wei(30000, 6)), // WETH = $3000
      v2(pool(TOKEN, WETH), wei(6000), wei(2)), // 2 WETH / 6000 TOKEN → $1.00
    ],
    dec,
    3000,
    new Map()
  );
  const tokenPool = vals.find((v) => v.pool.token0 === TOKEN);
  assert.ok(tokenPool?.price0Usd);
  assert.equal(Math.round((tokenPool.price0Usd ?? 0) * 100), 100);
});

test("V3: prices from sqrtPriceX96, not the (skewed) balance ratio", () => {
  // token0 = STABLE (6dec), token1 = TOKEN (18dec). Target: TOKEN ≈ $0.004343.
  // sqrtPriceX96 for that pool, taken from a live pool on chain.
  const state: PoolState = {
    pool: pool(STABLE, TOKEN, "v3"),
    reserve0: wei(38089, 6), // balances imply ~$0.00214 — the wrong answer
    reserve1: wei(17819372),
    sqrtPriceX96: 1202206680750766565250089437962800459n,
  };
  const [v] = valuePools([state], dec, 3000, new Map());
  assert.ok(v.price1Usd, "TOKEN should be priced");
  const p = v.price1Usd ?? 0;
  assert.ok(p > 0.0040 && p < 0.0047, `expected ~0.00434, got ${p}`);
});

test("rejects a near-empty pool implying an absurd unit price", () => {
  const [v] = valuePools([v2(pool(TOKEN, STABLE), 1n, wei(50000, 6))], dec, 3000, new Map());
  assert.equal(v.price0Usd, null);
  assert.equal(v.liquidityUsd, null);
});

test("leaves a token/token pool with no quote side unpriced", () => {
  const [v] = valuePools([v2(pool(TOKEN, TOKEN_B), wei(100), wei(100))], dec, 3000, new Map());
  assert.equal(v.liquidityUsd, null);
});
