import { formatUnits } from "viem";
import { query } from "../db/pool.js";
import { config } from "../config/index.js";
import { contracts, isStablecoin, isWeth } from "../dex/contracts.js";
import type { DecodedSwap } from "../dex/adapter.js";

/**
 * Phase-2a pricing: a stablecoin anchor plus one hop through WETH.
 *   - stablecoins are treated as exactly $1
 *   - WETH/USD is tracked from WETH-vs-stablecoin swaps (seeded from history)
 *   - any token that trades against a stablecoin or WETH gets a USD price and
 *     the swap gets a USD size; everything else is left null (not guessed)
 *
 * Real volume-weighted per-token pricing is Phase 2b's statistics worker.
 */

export interface SwapPricing {
  /** USD notional of the trade, or null when neither side is a known quote asset. */
  usdValue: number | null;
  /** USD price of the non-quote token in the swap, or null. */
  price: number | null;
}

export interface TokenDecimals {
  (address: string): number;
}

let wethUsd: number | null = null;
let seeded = false;

async function seedWethUsd(): Promise<void> {
  seeded = true;
  if (contracts.stablecoins.length === 0) return;
  const { rows } = await query<{ token_in: string; token_out: string; amount_in: string; amount_out: string }>(
    `SELECT token_in, token_out, amount_in, amount_out
       FROM swaps
      WHERE chain_id = $1
        AND ( (token_in = $2  AND token_out = ANY($3))
           OR (token_out = $2 AND token_in  = ANY($3)) )
      ORDER BY block_number DESC
      LIMIT 1`,
    [config.CHAIN_ID, contracts.weth, contracts.stablecoins]
  );
  const row = rows[0];
  if (!row) return;
  // amounts are raw integers; WETH is 18-dec, stables assumed 6-dec here only
  // for the seed — the live path below uses real decimals.
  const inWethSide = row.token_in === contracts.weth;
  const weth = Number(formatUnits(BigInt(inWethSide ? row.amount_in : row.amount_out), 18));
  const stable = Number(BigInt(inWethSide ? row.amount_out : row.amount_in)) / 1e6;
  if (weth > 0 && stable > 0) wethUsd = stable / weth;
}

function human(amount: bigint, decimals: number): number {
  return Number(formatUnits(amount, decimals));
}

/** usd_value is NUMERIC(20,6) (< 1e14); price is NUMERIC(38,18) (< 1e20). */
function guardUsd(n: number): number | null {
  return Number.isFinite(n) && n >= 0 && n < 1e14 ? n : null;
}
function guardPrice(n: number): number | null {
  return Number.isFinite(n) && n >= 0 && n < 1e18 ? n : null;
}

/**
 * Prices a batch of swaps from one block. Updates the WETH/USD anchor from any
 * WETH↔stable swaps in the batch first, then prices the rest.
 */
export async function priceSwaps(
  swaps: DecodedSwap[],
  decimalsOf: TokenDecimals
): Promise<Map<string, SwapPricing>> {
  if (!seeded) await seedWethUsd();

  // Pass 1: refresh the WETH/USD anchor.
  for (const s of swaps) {
    const inW = isWeth(s.tokenIn);
    const outW = isWeth(s.tokenOut);
    const inS = isStablecoin(s.tokenIn);
    const outS = isStablecoin(s.tokenOut);
    if (inW && outS) {
      const w = human(s.amountIn, decimalsOf(s.tokenIn));
      const d = human(s.amountOut, decimalsOf(s.tokenOut));
      if (w > 0 && d > 0) wethUsd = d / w;
    } else if (outW && inS) {
      const w = human(s.amountOut, decimalsOf(s.tokenOut));
      const d = human(s.amountIn, decimalsOf(s.tokenIn));
      if (w > 0 && d > 0) wethUsd = d / w;
    }
  }

  // Pass 2: price each swap.
  const out = new Map<string, SwapPricing>();
  for (const s of swaps) {
    const key = `${s.txHash}:${s.logIndex}`;
    const humanIn = human(s.amountIn, decimalsOf(s.tokenIn));
    const humanOut = human(s.amountOut, decimalsOf(s.tokenOut));
    if (humanIn <= 0 || humanOut <= 0) {
      out.set(key, { usdValue: null, price: null });
      continue;
    }
    if (isStablecoin(s.tokenIn)) {
      out.set(key, { usdValue: guardUsd(humanIn), price: guardPrice(humanIn / humanOut) });
    } else if (isStablecoin(s.tokenOut)) {
      out.set(key, { usdValue: guardUsd(humanOut), price: guardPrice(humanOut / humanIn) });
    } else if (isWeth(s.tokenIn) && wethUsd) {
      const usd = humanIn * wethUsd;
      out.set(key, { usdValue: guardUsd(usd), price: guardPrice(usd / humanOut) });
    } else if (isWeth(s.tokenOut) && wethUsd) {
      const usd = humanOut * wethUsd;
      out.set(key, { usdValue: guardUsd(usd), price: guardPrice(usd / humanIn) });
    } else {
      out.set(key, { usdValue: null, price: null });
    }
  }
  return out;
}

export function currentWethUsd(): number | null {
  return wethUsd;
}
