import { formatUnits } from "viem";
import { isStablecoin, isWeth } from "../dex/contracts.js";

export const PNL_ENGINE_VERSION = "1.0";

/** A DEX swap for one wallet, as read from the `swaps` table. */
export interface WalletSwap {
  txHash: string;
  dex: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOut: bigint;
  usdValue: number | null;
  decIn: number;
  decOut: number;
  timestamp: string;
  blockNumber: number;
  logIndex: number;
}

/** One economic trade: a wallet's net acquire/dispose of a non-quote token in a tx. */
export interface Trade {
  txHash: string;
  token: string;
  side: "buy" | "sell";
  qty: number;
  usd: number | null;
  price: number | null;
  dex: string;
  timestamp: string;
  blockNumber: number;
}

export interface FinalizedTrade extends Trade {
  costBasis: number | null;
  realizedPnl: number | null;
}

export interface Position {
  token: string;
  qty: number;
  costBasis: number;
  averageCost: number;
  realizedPnl: number;
  /** Realized against a real tracked cost basis. */
  realizedMatched: number;
  /** Proceeds from selling tokens we never saw bought (airdrop, or a buy before
   *  our indexed history) — could be profit, could be a blind spot. */
  realizedUnmatched: number;
  unrealizedPnl: number | null;
  currentPrice: number | null;
  currentValue: number | null;
  buyUsd: number;
  sellUsd: number;
  /** true once at least one buy with a USD value has landed. */
  hasCostBasis: boolean;
  firstBuyAt: string | null;
  lastActivityAt: string;
  isOpen: boolean;
}

const isQuote = (t: string): boolean => isWeth(t) || isStablecoin(t);
const DUST = 1e-9;

/**
 * Collapse a wallet's raw swaps into economic trades. Swaps in one tx are netted
 * per token, so a multi-hop route (ETH→USDC→TOKEN) becomes a single BUY TOKEN
 * rather than two unrelated legs. Quote assets (WETH/stables) are the medium of
 * exchange, not the thing traded, so they don't produce trades themselves.
 */
export function reconstructTrades(swaps: WalletSwap[]): Trade[] {
  const byTx = new Map<string, WalletSwap[]>();
  for (const s of swaps) {
    const arr = byTx.get(s.txHash);
    if (arr) arr.push(s);
    else byTx.set(s.txHash, [s]);
  }

  const trades: Trade[] = [];
  for (const group of byTx.values()) {
    const delta = new Map<string, number>();
    const tokenUsd = new Map<string, number>();
    const tokenDex = new Map<string, string>();
    const first = group[0];

    for (const s of group) {
      const aIn = Number(formatUnits(s.amountIn, s.decIn));
      const aOut = Number(formatUnits(s.amountOut, s.decOut));
      delta.set(s.tokenIn, (delta.get(s.tokenIn) ?? 0) - aIn);
      delta.set(s.tokenOut, (delta.get(s.tokenOut) ?? 0) + aOut);
      if (s.usdValue != null) {
        for (const side of [s.tokenIn, s.tokenOut]) {
          if (isQuote(side)) continue;
          if (s.usdValue > (tokenUsd.get(side) ?? -1)) {
            tokenUsd.set(side, s.usdValue);
            tokenDex.set(side, s.dex);
          }
        }
      }
    }

    for (const [token, d] of delta) {
      if (isQuote(token) || Math.abs(d) < DUST) continue;
      const qty = Math.abs(d);
      const usd = tokenUsd.get(token) ?? null;
      trades.push({
        txHash: first.txHash,
        token,
        side: d > 0 ? "buy" : "sell",
        qty,
        usd,
        price: usd != null && qty > 0 ? usd / qty : null,
        dex: tokenDex.get(token) ?? first.dex,
        timestamp: first.timestamp,
        blockNumber: first.blockNumber,
      });
    }
  }

  trades.sort((a, b) => a.blockNumber - b.blockNumber);
  return trades;
}

/**
 * Average-cost-basis PnL. For each token, buys raise the position and its total
 * cost; sells realise `proceeds − (avgCost × qtySold)`. Selling more than the
 * tracked position (tokens that arrived by transfer/airdrop we never recorded a
 * buy for) realises the excess against a zero cost basis.
 */
export function runPnl(trades: Trade[]): {
  positions: Map<string, Position>;
  finalized: FinalizedTrade[];
} {
  const positions = new Map<string, Position>();
  const finalized: FinalizedTrade[] = [];

  for (const t of trades) {
    let p = positions.get(t.token);
    if (!p) {
      p = {
        token: t.token,
        qty: 0,
        costBasis: 0,
        averageCost: 0,
        realizedPnl: 0,
        realizedMatched: 0,
        realizedUnmatched: 0,
        unrealizedPnl: null,
        currentPrice: null,
        currentValue: null,
        buyUsd: 0,
        sellUsd: 0,
        hasCostBasis: false,
        firstBuyAt: null,
        lastActivityAt: t.timestamp,
        isOpen: true,
      };
      positions.set(t.token, p);
    }
    p.lastActivityAt = t.timestamp;

    let costBasis: number | null = null;
    let realized: number | null = null;

    if (t.side === "buy") {
      p.qty += t.qty;
      if (t.usd != null) {
        p.costBasis += t.usd;
        p.buyUsd += t.usd;
        p.hasCostBasis = true;
      }
      if (!p.firstBuyAt) p.firstBuyAt = t.timestamp;
    } else {
      const proceeds = t.usd ?? 0;
      if (p.qty > DUST && p.costBasis > DUST) {
        const sellable = Math.min(t.qty, p.qty);
        const avgCost = p.costBasis / p.qty;
        costBasis = avgCost * sellable;
        const proceedsSellable = t.qty > 0 ? proceeds * (sellable / t.qty) : proceeds;
        const proceedsExcess = proceeds - proceedsSellable;
        realized = proceedsSellable - costBasis;
        p.realizedMatched += realized;
        p.realizedUnmatched += proceedsExcess; // sold more than we tracked
        realized += proceedsExcess;
        p.qty = Math.max(0, p.qty - t.qty);
        p.costBasis = Math.max(0, p.costBasis - costBasis);
      } else {
        // Selling tokens with no tracked cost — airdrop, or a buy before our
        // indexed history. Record proceeds but flag them as unmatched.
        costBasis = 0;
        realized = proceeds;
        p.realizedUnmatched += proceeds;
        p.qty = Math.max(0, p.qty - t.qty);
      }
      p.realizedPnl += realized;
      if (t.usd != null) p.sellUsd += t.usd;
    }

    p.averageCost = p.qty > DUST ? p.costBasis / p.qty : 0;
    finalized.push({ ...t, costBasis, realizedPnl: realized });
  }

  for (const p of positions.values()) p.isOpen = p.qty > DUST;
  return { positions, finalized };
}
