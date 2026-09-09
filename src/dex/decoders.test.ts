import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, encodeEventTopics, parseAbiParameters, type Hex } from "viem";
import { V2_SWAP_ABI, V3_SWAP_ABI } from "./events.js";
import { UniswapV2Decoder } from "./uniswapV2.js";
import { UniswapV3Decoder } from "./uniswapV3.js";
import type { KnownPool, TxContext } from "./adapter.js";

const TOKEN0 = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;
const TOKEN1 = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Hex;
const POOL = "0xcccccccccccccccccccccccccccccccccccccccc" as Hex;
const ROUTER = "0xdddddddddddddddddddddddddddddddddddddddd" as Hex;
const EOA = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Hex;
const TRADER = "0x1111111111111111111111111111111111111111" as Hex;

const pool: KnownPool = {
  address: POOL,
  dex: "uniswap_v2",
  poolType: "v2",
  token0: TOKEN0,
  token1: TOKEN1,
  feeTier: null,
  factory: null,
};
const ctx: TxContext = {
  txFrom: TRADER,
  txHash: ("0x" + "12".repeat(32)) as Hex,
  blockNumber: 100n,
  timestamp: 1_700_000_000,
};

function v2SwapLog(a: {
  amount0In: bigint;
  amount1In: bigint;
  amount0Out: bigint;
  amount1Out: bigint;
}) {
  return {
    address: POOL,
    logIndex: 0,
    topics: encodeEventTopics({
      abi: V2_SWAP_ABI,
      eventName: "Swap",
      args: { sender: ROUTER, to: EOA },
    }) as Hex[],
    data: encodeAbiParameters(parseAbiParameters("uint256, uint256, uint256, uint256"), [
      a.amount0In,
      a.amount1In,
      a.amount0Out,
      a.amount1Out,
    ]),
  };
}

function v3SwapLog(amount0: bigint, amount1: bigint) {
  return {
    address: POOL,
    logIndex: 0,
    topics: encodeEventTopics({
      abi: V3_SWAP_ABI,
      eventName: "Swap",
      args: { sender: ROUTER, recipient: EOA },
    }) as Hex[],
    data: encodeAbiParameters(parseAbiParameters("int256, int256, uint160, uint128, int24"), [
      amount0,
      amount1,
      0n,
      0n,
      0,
    ]),
  };
}

test("V2 decodeSwap: token0-in resolves direction, amounts, and EOA", () => {
  const swap = new UniswapV2Decoder().decodeSwap(
    v2SwapLog({ amount0In: 1_000n, amount1In: 0n, amount0Out: 0n, amount1Out: 950n }),
    pool,
    ctx
  );
  assert.ok(swap);
  assert.equal(swap.tokenIn, TOKEN0);
  assert.equal(swap.tokenOut, TOKEN1);
  assert.equal(swap.amountIn, 1_000n);
  assert.equal(swap.amountOut, 950n);
  assert.equal(swap.walletAddress, TRADER); // EOA from ctx, not the router
  assert.equal(swap.sender, ROUTER);
  assert.equal(swap.recipient, EOA);
});

test("V2 decodeSwap: token1-in reverses direction", () => {
  const swap = new UniswapV2Decoder().decodeSwap(
    v2SwapLog({ amount0In: 0n, amount1In: 500n, amount0Out: 480n, amount1Out: 0n }),
    pool,
    ctx
  );
  assert.ok(swap);
  assert.equal(swap.tokenIn, TOKEN1);
  assert.equal(swap.tokenOut, TOKEN0);
  assert.equal(swap.amountIn, 500n);
  assert.equal(swap.amountOut, 480n);
});

test("V3 decodeSwap: positive amount is tokenIn, negative is tokenOut", () => {
  const swap = new UniswapV3Decoder().decodeSwap(v3SwapLog(1_000n, -900n), pool, ctx);
  assert.ok(swap);
  assert.equal(swap.tokenIn, TOKEN0);
  assert.equal(swap.tokenOut, TOKEN1);
  assert.equal(swap.amountIn, 1_000n);
  assert.equal(swap.amountOut, 900n);
});

test("V3 decodeSwap: opposite direction", () => {
  const swap = new UniswapV3Decoder().decodeSwap(v3SwapLog(-2_000n, 2_100n), pool, ctx);
  assert.ok(swap);
  assert.equal(swap.tokenIn, TOKEN1);
  assert.equal(swap.tokenOut, TOKEN0);
  assert.equal(swap.amountIn, 2_100n);
  assert.equal(swap.amountOut, 2_000n);
});

test("decoders return null on unrelated log data", () => {
  const junk = ("0x" + "00".repeat(32)) as Hex;
  const junkLog = { address: POOL, logIndex: 0, topics: [junk] as Hex[], data: junk };
  assert.equal(new UniswapV2Decoder().decodeSwap(junkLog, pool, ctx), null);
  assert.equal(new UniswapV3Decoder().decodeSwap(junkLog, pool, ctx), null);
});
