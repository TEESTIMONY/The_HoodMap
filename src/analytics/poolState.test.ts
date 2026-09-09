import { test } from "node:test";
import assert from "node:assert/strict";
import { valuePools } from "./poolState.js";
import { contracts } from "../dex/contracts.js";
import type { KnownPool } from "../dex/adapter.js";

const STABLE = contracts.stablecoins[0] ?? "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH = contracts.weth;
const TOKEN = "0x1111111111111111111111111111111111111111" as const;
const TOKEN_B = "0x2222222222222222222222222222222222222222" as const;

function pool(t0: string, t1: string): KnownPool {
  return { address: ("0x" + "ab".repeat(20)) as `0x${string}`, dex: "uniswap_v2", poolType: "v2",
    token0: t0 as `0x${string}`, token1: t1 as `0x${string}`, feeTier: null, factory: null };
}
const dec = (a: string) => (a.toLowerCase() === STABLE.toLowerCase() ? 6 : 18);
const wei = (n: number, d = 18) => BigInt(Math.round(n * 10 ** Math.min(d, 9))) * 10n ** BigInt(Math.max(0, d - 9));

test("prices a token directly against a stablecoin", () => {
  const [v] = valuePools(
    [{ pool: pool(TOKEN, STABLE), reserve0: wei(1000), reserve1: wei(2000, 6) }],
    dec,
    3000,
    new Map()
  );
  assert.ok(v.price0Usd);
  assert.equal(Math.round(v.price0Usd), 2); // 2000 USDG / 1000 TOKEN
  assert.equal(Math.round(v.liquidityUsd ?? 0), 4000); // both sides ~$2000
});

test("propagates price through WETH in the second pass", () => {
  const known = new Map<string, number>();
  const vals = valuePools(
    [
      { pool: pool(WETH, STABLE), reserve0: wei(10), reserve1: wei(30000, 6) }, // WETH=$3000
      { pool: pool(TOKEN, WETH), reserve0: wei(6000), reserve1: wei(2) }, // 2 WETH / 6000 TOKEN
    ],
    dec,
    3000,
    known
  );
  const tokenPool = vals.find((v) => v.pool.token0 === TOKEN);
  assert.ok(tokenPool?.price0Usd);
  assert.equal(Math.round((tokenPool.price0Usd ?? 0) * 1000), 1000); // ~$1.00
});

test("rejects a near-empty pool that implies an absurd unit price", () => {
  const [v] = valuePools(
    [{ pool: pool(TOKEN, STABLE), reserve0: 1n, reserve1: wei(50000, 6) }], // 1 wei TOKEN vs $50k
    dec,
    3000,
    new Map()
  );
  assert.equal(v.price0Usd, null);
  assert.equal(v.liquidityUsd, null);
});

test("leaves a token/token pool with no quote side unpriced", () => {
  const [v] = valuePools(
    [{ pool: pool(TOKEN, TOKEN_B), reserve0: wei(100), reserve1: wei(100) }],
    dec,
    3000,
    new Map()
  );
  assert.equal(v.liquidityUsd, null);
});
