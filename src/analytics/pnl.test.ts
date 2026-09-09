import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructTrades, runPnl, type WalletSwap } from "./pnl.js";
import { contracts } from "../dex/contracts.js";

const USDG = contracts.stablecoins[0] ?? "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH = contracts.weth;
const TOKEN = "0x1111111111111111111111111111111111111111";
const TOKEN_B = "0x2222222222222222222222222222222222222222";

const wei = (n: number, d = 18) =>
  BigInt(Math.round(n * 1e9)) * 10n ** BigInt(Math.max(0, d - 9));

function swap(o: Partial<WalletSwap> & Pick<WalletSwap, "tokenIn" | "tokenOut" | "amountIn" | "amountOut">): WalletSwap {
  return {
    txHash: "0xtx",
    dex: "uniswap_v3",
    usdValue: null,
    decIn: 18,
    decOut: 18,
    timestamp: "2026-09-01T00:00:00Z",
    blockNumber: 1,
    logIndex: 0,
    ...o,
  };
}

test("multi-hop USDG→WETH→TOKEN in one tx = one BUY TOKEN", () => {
  const trades = reconstructTrades([
    swap({ txHash: "0xa", tokenIn: USDG, tokenOut: WETH, amountIn: wei(3000, 6), amountOut: wei(1), decIn: 6, usdValue: 3000 }),
    swap({ txHash: "0xa", tokenIn: WETH, tokenOut: TOKEN, amountIn: wei(1), amountOut: wei(5000), usdValue: 3000 }),
  ]);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].token, TOKEN);
  assert.equal(trades[0].side, "buy");
  assert.equal(Math.round(trades[0].qty), 5000);
  assert.equal(trades[0].usd, 3000);
});

test("token→token swap makes a sell and a buy", () => {
  const trades = reconstructTrades([
    swap({ txHash: "0xb", tokenIn: TOKEN, tokenOut: TOKEN_B, amountIn: wei(100), amountOut: wei(200), usdValue: 500 }),
  ]);
  assert.deepEqual(new Set(trades.map((t) => `${t.token}:${t.side}`)), new Set([`${TOKEN}:sell`, `${TOKEN_B}:buy`]));
});

test("average-cost: two buys then a full sell realises the blended gain", () => {
  const { positions } = runPnl([
    { txHash: "1", token: TOKEN, side: "buy", qty: 100, usd: 100, price: 1, dex: "d", timestamp: "t1", blockNumber: 1 },
    { txHash: "2", token: TOKEN, side: "buy", qty: 100, usd: 300, price: 3, dex: "d", timestamp: "t2", blockNumber: 2 },
    { txHash: "3", token: TOKEN, side: "sell", qty: 200, usd: 600, price: 3, dex: "d", timestamp: "t3", blockNumber: 3 },
  ]);
  const p = positions.get(TOKEN)!;
  assert.equal(p.qty, 0);
  assert.equal(p.isOpen, false);
  assert.equal(Math.round(p.realizedPnl), 200); // proceeds 600 − cost basis 400
});

test("partial sell leaves the rest at the same average cost", () => {
  const { positions, finalized } = runPnl([
    { txHash: "1", token: TOKEN, side: "buy", qty: 200, usd: 300, price: 1.5, dex: "d", timestamp: "t1", blockNumber: 1 },
    { txHash: "2", token: TOKEN, side: "sell", qty: 100, usd: 300, price: 3, dex: "d", timestamp: "t2", blockNumber: 2 },
  ]);
  const p = positions.get(TOKEN)!;
  assert.equal(p.qty, 100);
  assert.equal(Math.round(p.averageCost * 100), 150); // still $1.50
  assert.equal(Math.round(finalized[1].realizedPnl ?? 0), 150); // 300 − (1.5×100)
});

test("selling more than tracked realises the excess against zero cost", () => {
  const { positions } = runPnl([
    { txHash: "1", token: TOKEN, side: "buy", qty: 50, usd: 50, price: 1, dex: "d", timestamp: "t1", blockNumber: 1 },
    { txHash: "2", token: TOKEN, side: "sell", qty: 100, usd: 400, price: 4, dex: "d", timestamp: "t2", blockNumber: 2 },
  ]);
  const p = positions.get(TOKEN)!;
  assert.equal(p.qty, 0);
  // sellable 50 @ cost 50 → proceeds share 200 − 50 = 150; excess 50 → +200; total 350
  assert.equal(Math.round(p.realizedPnl), 350);
});
