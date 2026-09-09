import type { PoolClient } from "pg";
import { query, withTransaction } from "../db/pool.js";
import { config } from "../config/index.js";
import { logger } from "../config/logger.js";
import { normalizeAddress } from "../lib/address.js";
import { getOrCreateIndexerState } from "../db/indexerState.js";
import {
  PNL_ENGINE_VERSION,
  reconstructTrades,
  runPnl,
  type FinalizedTrade,
  type Position,
  type WalletSwap,
} from "./pnl.js";
import { backfillWalletTrades, walletIsFresh } from "./walletBackfill.js";

const MAX_SWAPS = 8_000; // cap the heaviest wallets; noted in the response

interface SwapRow {
  transaction_hash: string;
  dex: string;
  token_in: string;
  token_out: string;
  amount_in: string;
  amount_out: string;
  usd_value: string | null;
  dec_in: number | null;
  dec_out: number | null;
  timestamp: string;
  block_number: string;
  log_index: number;
}

export interface WalletSummary {
  wallet_address: string;
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
  portfolio_value: number;
  roi: number | null;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  breakeven_trades: number;
  win_rate: number | null;
  average_win: number | null;
  average_loss: number | null;
  best_trade_pnl: number | null;
  worst_trade_pnl: number | null;
  /** Portion of PnL from positions with no recorded purchase (airdrops, or buys
   *  before our indexed history) — informative, not certain. */
  unmatched_pnl: number;
  zero_cost_positions: number;
  total_volume: number;
  buy_volume: number;
  sell_volume: number;
  tokens_traded: number;
  open_positions: number;
  closed_positions: number;
  first_trade_at: string | null;
  last_trade_at: string | null;
  avg_holding_hours: number | null;
  indexed_through_block: string;
  pnl_confidence: "high" | "medium" | "low";
  pnl_engine_version: string;
  truncated: boolean;
}

async function loadWalletSwaps(address: string): Promise<{ swaps: WalletSwap[]; truncated: boolean }> {
  const { rows } = await query<SwapRow>(
    `SELECT s.transaction_hash, s.dex, s.token_in, s.token_out, s.amount_in, s.amount_out,
            s.usd_value, s.timestamp, s.block_number, s.log_index,
            ti.decimals AS dec_in, to2.decimals AS dec_out
       FROM swaps s
       JOIN tokens ti  ON ti.chain_id = s.chain_id  AND ti.address = s.token_in
       JOIN tokens to2 ON to2.chain_id = s.chain_id AND to2.address = s.token_out
      WHERE s.chain_id = $1 AND s.wallet_address = $2
      ORDER BY s.block_number, s.log_index
      LIMIT $3`,
    [config.CHAIN_ID, address, MAX_SWAPS + 1]
  );
  const truncated = rows.length > MAX_SWAPS;
  const swaps: WalletSwap[] = rows.slice(0, MAX_SWAPS).map((r) => ({
    txHash: r.transaction_hash,
    dex: r.dex,
    tokenIn: r.token_in,
    tokenOut: r.token_out,
    amountIn: BigInt(r.amount_in),
    amountOut: BigInt(r.amount_out),
    usdValue: r.usd_value != null ? Number(r.usd_value) : null,
    decIn: r.dec_in ?? 18,
    decOut: r.dec_out ?? 18,
    timestamp: r.timestamp,
    blockNumber: Number(r.block_number),
    logIndex: r.log_index,
  }));
  return { swaps, truncated };
}

function hoursBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
}

/**
 * Reconstruct trades from a wallet's swaps, run the average-cost PnL engine,
 * mark open positions to market, and persist trades / positions /
 * wallet_statistics for this wallet + engine version.
 */
export async function computeWalletPnl(
  addressRaw: string,
  opts: { skipBackfill?: boolean } = {}
): Promise<WalletSummary> {
  const address = normalizeAddress(addressRaw);

  // Pull this wallet's history from chain so analysis works even where the
  // indexer hasn't reached. Cached for ~10min per wallet.
  if (!opts.skipBackfill && !(await walletIsFresh(address))) {
    try {
      await backfillWalletTrades(address);
    } catch (err) {
      logger.warn({ wallet: address, err: (err as Error).message }, "wallet backfill failed");
    }
  }

  const state = await getOrCreateIndexerState();
  const indexedBlock = state.lastProcessedBlock.toString();

  const { swaps, truncated } = await loadWalletSwaps(address);
  const trades = reconstructTrades(swaps);
  const { positions, finalized } = runPnl(trades);

  // Mark open positions to market.
  const openTokens = [...positions.values()].filter((p) => p.isOpen).map((p) => p.token);
  const priceOf = new Map<string, number | null>();
  if (openTokens.length) {
    const { rows } = await query<{ token_address: string; price: string | null }>(
      `SELECT token_address, price FROM token_statistics
        WHERE chain_id = $1 AND token_address = ANY($2)`,
      [config.CHAIN_ID, openTokens]
    );
    for (const r of rows) priceOf.set(r.token_address, r.price != null ? Number(r.price) : null);
  }

  let unrealized = 0;
  let unrealizedUnmatched = 0;
  let portfolioValue = 0;
  let pricedOpen = 0;
  let unpricedOpen = 0;
  let zeroCostPositions = 0;
  for (const p of positions.values()) {
    if (!p.isOpen) continue;
    const price = priceOf.get(p.token) ?? null;
    if (price != null && price > 0) {
      p.currentPrice = price;
      p.currentValue = p.qty * price;
      p.unrealizedPnl = p.currentValue - p.costBasis;
      unrealized += p.unrealizedPnl;
      portfolioValue += p.currentValue;
      pricedOpen++;
      if (!p.hasCostBasis || p.costBasis <= 0.01) {
        unrealizedUnmatched += p.unrealizedPnl;
        zeroCostPositions++;
      }
    } else {
      unpricedOpen++;
    }
  }

  const realized = [...positions.values()].reduce((s, p) => s + p.realizedPnl, 0);
  const realizedUnmatched = [...positions.values()].reduce((s, p) => s + p.realizedUnmatched, 0);
  const unmatchedPnl = realizedUnmatched + unrealizedUnmatched;
  const sells = finalized.filter((t) => t.side === "sell" && t.realizedPnl != null);
  const wins = sells.filter((t) => (t.realizedPnl ?? 0) > 0.01);
  const losses = sells.filter((t) => (t.realizedPnl ?? 0) < -0.01);
  const breakeven = sells.length - wins.length - losses.length;

  const buyVolume = finalized.filter((t) => t.side === "buy").reduce((s, t) => s + (t.usd ?? 0), 0);
  const sellVolume = finalized.filter((t) => t.side === "sell").reduce((s, t) => s + (t.usd ?? 0), 0);
  const totalVolume = buyVolume + sellVolume;

  const closedPositions = [...positions.values()].filter((p) => !p.isOpen).length;
  const holdingHours: number[] = [];
  for (const p of positions.values()) {
    if (!p.isOpen && p.firstBuyAt) holdingHours.push(hoursBetween(p.firstBuyAt, p.lastActivityAt));
  }
  const avgHoldingHours = holdingHours.length
    ? holdingHours.reduce((s, h) => s + h, 0) / holdingHours.length
    : null;

  const totalPnl = realized + unrealized;
  const unpricedTradeShare = finalized.length
    ? finalized.filter((t) => t.usd == null).length / finalized.length
    : 0;
  const unmatchedShare = Math.abs(unmatchedPnl) / (Math.abs(totalPnl) + 1);
  const pnlConfidence: WalletSummary["pnl_confidence"] =
    unpricedTradeShare > 0.25 || unpricedOpen > pricedOpen || unmatchedShare > 0.4
      ? "low"
      : unpricedTradeShare > 0 || unpricedOpen > 0 || unmatchedShare > 0.1
        ? "medium"
        : "high";

  const summary: WalletSummary = {
    wallet_address: address,
    realized_pnl: realized,
    unrealized_pnl: unrealized,
    total_pnl: totalPnl,
    portfolio_value: portfolioValue,
    roi: buyVolume > 0 ? totalPnl / buyVolume : null,
    total_trades: finalized.length,
    winning_trades: wins.length,
    losing_trades: losses.length,
    breakeven_trades: breakeven,
    win_rate: wins.length + losses.length > 0 ? wins.length / (wins.length + losses.length) : null,
    average_win: wins.length ? wins.reduce((s, t) => s + (t.realizedPnl ?? 0), 0) / wins.length : null,
    average_loss: losses.length ? losses.reduce((s, t) => s + (t.realizedPnl ?? 0), 0) / losses.length : null,
    best_trade_pnl: sells.length ? Math.max(...sells.map((t) => t.realizedPnl ?? 0)) : null,
    worst_trade_pnl: sells.length ? Math.min(...sells.map((t) => t.realizedPnl ?? 0)) : null,
    unmatched_pnl: unmatchedPnl,
    zero_cost_positions: zeroCostPositions,
    total_volume: totalVolume,
    buy_volume: buyVolume,
    sell_volume: sellVolume,
    tokens_traded: new Set(finalized.map((t) => t.token)).size,
    open_positions: pricedOpen + unpricedOpen,
    closed_positions: closedPositions,
    first_trade_at: finalized[0]?.timestamp ?? null,
    last_trade_at: finalized.at(-1)?.timestamp ?? null,
    avg_holding_hours: avgHoldingHours,
    indexed_through_block: indexedBlock,
    pnl_confidence: pnlConfidence,
    pnl_engine_version: PNL_ENGINE_VERSION,
    truncated,
  };

  await persist(address, finalized, positions, summary);
  return summary;
}

async function persist(
  address: string,
  trades: FinalizedTrade[],
  positions: Map<string, Position>,
  s: WalletSummary
): Promise<void> {
  await withTransaction(async (client: PoolClient) => {
    await client.query(
      `DELETE FROM trades WHERE chain_id = $1 AND wallet_address = $2 AND pnl_engine_version = $3`,
      [config.CHAIN_ID, address, PNL_ENGINE_VERSION]
    );
    await client.query(
      `DELETE FROM positions WHERE chain_id = $1 AND wallet_address = $2 AND pnl_engine_version = $3`,
      [config.CHAIN_ID, address, PNL_ENGINE_VERSION]
    );

    // Batched multi-row inserts — one round trip each, not one per row (the
    // Supabase pooler adds ~150ms latency per statement).
    for (let i = 0; i < trades.length; i += 200) {
      const chunk = trades.slice(i, i + 200);
      const vals: unknown[] = [config.CHAIN_ID, address, PNL_ENGINE_VERSION];
      const tuples = chunk.map((t, j) => {
        const b = j * 10;
        vals.push(t.token, t.side, t.qty, t.price, t.usd, t.costBasis, t.realizedPnl, t.dex, t.txHash, t.timestamp);
        return `($1,$2,$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$3,$${b + 12},$${b + 13})`;
      });
      await client.query(
        `INSERT INTO trades
           (chain_id, wallet_address, token_address, side, quantity, price, usd_value,
            cost_basis, realized_pnl, dex, pnl_engine_version, tx_hash, timestamp)
         VALUES ${tuples.join(",")}
         ON CONFLICT (chain_id, wallet_address, token_address, tx_hash, side, pnl_engine_version)
           DO NOTHING`,
        vals
      );
    }

    const posRows = [...positions.values()];
    for (let i = 0; i < posRows.length; i += 200) {
      const chunk = posRows.slice(i, i + 200);
      const vals: unknown[] = [config.CHAIN_ID, address, PNL_ENGINE_VERSION];
      const tuples = chunk.map((p, j) => {
        const b = j * 16;
        vals.push(
          p.token, p.qty, p.averageCost, p.costBasis, p.realizedPnl, p.realizedMatched,
          p.realizedUnmatched, p.hasCostBasis, p.unrealizedPnl ?? 0, p.currentPrice, p.currentValue,
          p.isOpen, p.buyUsd, p.sellUsd, p.firstBuyAt, p.lastActivityAt
        );
        return `($1,$2,$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14},$${b + 15},$${b + 16},$${b + 17},$${b + 18},$${b + 19},$3, now())`;
      });
      await client.query(
        `INSERT INTO positions
           (chain_id, wallet_address, token_address, quantity, average_cost, cost_basis,
            realized_pnl, realized_matched, realized_unmatched, has_cost_basis,
            unrealized_pnl, current_price, current_value, is_open,
            buy_usd, sell_usd, first_buy_at, last_activity_at, pnl_engine_version, updated_at)
         VALUES ${tuples.join(",")}
         ON CONFLICT (chain_id, wallet_address, token_address) DO UPDATE SET
           quantity = EXCLUDED.quantity, average_cost = EXCLUDED.average_cost,
           cost_basis = EXCLUDED.cost_basis, realized_pnl = EXCLUDED.realized_pnl,
           realized_matched = EXCLUDED.realized_matched, realized_unmatched = EXCLUDED.realized_unmatched,
           has_cost_basis = EXCLUDED.has_cost_basis,
           unrealized_pnl = EXCLUDED.unrealized_pnl, current_price = EXCLUDED.current_price,
           current_value = EXCLUDED.current_value, is_open = EXCLUDED.is_open,
           buy_usd = EXCLUDED.buy_usd, sell_usd = EXCLUDED.sell_usd,
           first_buy_at = EXCLUDED.first_buy_at, last_activity_at = EXCLUDED.last_activity_at,
           pnl_engine_version = EXCLUDED.pnl_engine_version, updated_at = now()`,
        vals
      );
    }

    await client.query(
      `INSERT INTO wallet_statistics
         (chain_id, wallet_address, portfolio_value, realized_pnl, unrealized_pnl, total_pnl,
          unmatched_pnl, zero_cost_positions,
          total_trades, winning_trades, losing_trades, breakeven_trades, win_rate, total_volume,
          buy_volume, sell_volume, best_trade_pnl, worst_trade_pnl, average_win, average_loss,
          roi, tokens_traded, open_positions, closed_positions, first_trade_at, last_trade_at,
          avg_holding_hours, indexed_through_block, pnl_confidence, pnl_engine_version,
          computed_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
               $23,$24,$25,$26,$27,$28,$29,$30, now(), now())
       ON CONFLICT (chain_id, wallet_address) DO UPDATE SET
         portfolio_value = EXCLUDED.portfolio_value, realized_pnl = EXCLUDED.realized_pnl,
         unrealized_pnl = EXCLUDED.unrealized_pnl, total_pnl = EXCLUDED.total_pnl,
         unmatched_pnl = EXCLUDED.unmatched_pnl, zero_cost_positions = EXCLUDED.zero_cost_positions,
         total_trades = EXCLUDED.total_trades, winning_trades = EXCLUDED.winning_trades,
         losing_trades = EXCLUDED.losing_trades, breakeven_trades = EXCLUDED.breakeven_trades,
         win_rate = EXCLUDED.win_rate, total_volume = EXCLUDED.total_volume,
         buy_volume = EXCLUDED.buy_volume, sell_volume = EXCLUDED.sell_volume,
         best_trade_pnl = EXCLUDED.best_trade_pnl, worst_trade_pnl = EXCLUDED.worst_trade_pnl,
         average_win = EXCLUDED.average_win, average_loss = EXCLUDED.average_loss,
         roi = EXCLUDED.roi, tokens_traded = EXCLUDED.tokens_traded,
         open_positions = EXCLUDED.open_positions, closed_positions = EXCLUDED.closed_positions,
         first_trade_at = EXCLUDED.first_trade_at, last_trade_at = EXCLUDED.last_trade_at,
         avg_holding_hours = EXCLUDED.avg_holding_hours,
         indexed_through_block = EXCLUDED.indexed_through_block,
         pnl_confidence = EXCLUDED.pnl_confidence, pnl_engine_version = EXCLUDED.pnl_engine_version,
         computed_at = now(), updated_at = now()`,
      [
        config.CHAIN_ID,
        address,
        s.portfolio_value,
        s.realized_pnl,
        s.unrealized_pnl,
        s.total_pnl,
        s.unmatched_pnl,
        s.zero_cost_positions,
        s.total_trades,
        s.winning_trades,
        s.losing_trades,
        s.breakeven_trades,
        s.win_rate,
        s.total_volume,
        s.buy_volume,
        s.sell_volume,
        s.best_trade_pnl,
        s.worst_trade_pnl,
        s.average_win,
        s.average_loss,
        s.roi,
        s.tokens_traded,
        s.open_positions,
        s.closed_positions,
        s.first_trade_at,
        s.last_trade_at,
        s.avg_holding_hours,
        s.indexed_through_block,
        s.pnl_confidence,
        PNL_ENGINE_VERSION,
      ]
    );
  });
  logger.info(
    { wallet: address, trades: trades.length, realized: s.realized_pnl.toFixed(2) },
    "wallet PnL computed"
  );
}
