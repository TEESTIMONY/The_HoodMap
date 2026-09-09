import type { Hex } from "viem";
import type { PoolClient } from "pg";
import { withTransaction } from "../db/pool.js";
import { config } from "../config/index.js";
import { logger } from "../config/logger.js";
import { addressFromTopic, normalizeAddress } from "../lib/address.js";
import type { RawBlock, RawReceipt } from "../indexer/types.js";
import type { DecodedLiquidityEvent, DecodedSwap, RawLogInput, TxContext } from "../dex/adapter.js";
import {
  liquidityDecoderForTopic,
  swapDecoderForTopic,
  watchedLiquidityTopics,
  watchedSwapTopics,
} from "../dex/registry.js";
import { ERC20_TRANSFER_TOPIC } from "../dex/events.js";
import { decimalsOf, ensureTokens, resolvePools } from "./entities.js";
import { priceSwaps } from "../analytics/price.js";

export interface DecodeSummary {
  transfers: number;
  swaps: number;
  liquidityEvents: number;
}

interface Contextualised {
  log: RawLogInput;
  ctx: TxContext;
}

interface ParsedTransfer {
  token: Hex;
  from: Hex;
  to: Hex;
  amount: bigint;
  txHash: Hex;
  logIndex: number;
  blockNumber: bigint;
  timestamp: number;
}

function parseTransfer(log: RawLogInput, ctx: TxContext): ParsedTransfer | null {
  // Exactly 3 topics ⇒ ERC-20 (ERC-721 Transfer has a 4th indexed tokenId).
  if (log.topics.length !== 3) return null;
  let amount: bigint;
  try {
    amount = BigInt(log.data);
  } catch {
    return null;
  }
  return {
    token: normalizeAddress(log.address),
    from: addressFromTopic(log.topics[1]),
    to: addressFromTopic(log.topics[2]),
    amount,
    txHash: ctx.txHash,
    logIndex: log.logIndex,
    blockNumber: ctx.blockNumber,
    timestamp: ctx.timestamp,
  };
}

/**
 * Second stage of block processing: turn the raw logs just persisted by
 * `saveBlock` into normalized `token_transfers` / `swaps` / `liquidity_events`,
 * discovering tokens and pools on the way. Best-effort and re-runnable — raw
 * data is the source of truth, so a failure here is logged and retried later
 * rather than blocking the indexer.
 */
export async function decodeBlock(
  block: RawBlock,
  receipts: readonly RawReceipt[]
): Promise<DecodeSummary> {
  const txByHash = new Map(block.transactions.map((t) => [t.hash.toLowerCase(), t]));
  const timestamp = Number(block.timestamp);

  const logs: Contextualised[] = [];
  for (const r of receipts) {
    if (r.status !== "success") continue; // reverted tx ⇒ its logs didn't happen
    const tx = txByHash.get(r.transactionHash.toLowerCase());
    if (!tx) continue;
    const ctx: TxContext = {
      txFrom: normalizeAddress(tx.from),
      txHash: r.transactionHash,
      blockNumber: block.number,
      timestamp,
    };
    for (const lg of r.logs) {
      logs.push({
        log: {
          address: normalizeAddress(lg.address),
          topics: lg.topics as readonly Hex[],
          data: lg.data,
          logIndex: lg.logIndex,
        },
        ctx,
      });
    }
  }

  const transferLogs = logs.filter(({ log }) => log.topics[0] === ERC20_TRANSFER_TOPIC);
  const swapLogs = logs.filter(({ log }) => log.topics[0] && watchedSwapTopics.has(log.topics[0]));
  const liquidityLogs = logs.filter(
    ({ log }) => log.topics[0] && watchedLiquidityTopics.has(log.topics[0])
  );

  // ---- discovery (RPC, outside the write txn) ----
  const poolAddrs = [...new Set([...swapLogs, ...liquidityLogs].map(({ log }) => log.address))];
  const pools = await resolvePools(poolAddrs, block.number);

  const transfers = transferLogs
    .map(({ log, ctx }) => parseTransfer(log, ctx))
    .filter((t): t is ParsedTransfer => t !== null);
  await ensureTokens(
    transfers.map((t) => t.token),
    block.number
  );

  // ---- decode ----
  const swaps: { swap: DecodedSwap; dex: string }[] = [];
  for (const { log, ctx } of swapLogs) {
    const pool = pools.get(log.address);
    const decoder = swapDecoderForTopic(log.topics[0]);
    if (!pool || !decoder) continue;
    const swap = decoder.decodeSwap(log, pool, ctx);
    if (swap) swaps.push({ swap, dex: pool.dex });
  }

  const liquidityEvents: { event: DecodedLiquidityEvent; dex: string }[] = [];
  for (const { log, ctx } of liquidityLogs) {
    const pool = pools.get(log.address);
    const match = liquidityDecoderForTopic(log.topics[0]);
    if (!pool || !match) continue;
    const event = match.decoder.decodeLiquidity(log, pool, ctx);
    if (event) liquidityEvents.push({ event, dex: pool.dex });
  }

  const pricing = await priceSwaps(
    swaps.map((s) => s.swap),
    decimalsOf
  );

  // ---- write (one txn; reorg rewind covers these tables) ----
  await withTransaction(async (client) => {
    for (const t of transfers) await insertTransfer(client, t);
    for (const { swap, dex } of swaps) {
      const p = pricing.get(`${swap.txHash}:${swap.logIndex}`);
      await insertSwap(client, swap, dex, p?.usdValue ?? null, p?.price ?? null);
      await upsertTraderWallet(client, swap.walletAddress, swap.blockNumber, swap.timestamp);
    }
    for (const { event, dex } of liquidityEvents) await insertLiquidityEvent(client, event, dex);
  });

  return {
    transfers: transfers.length,
    swaps: swaps.length,
    liquidityEvents: liquidityEvents.length,
  };
}

async function insertTransfer(client: PoolClient, t: ParsedTransfer): Promise<void> {
  await client.query(
    `INSERT INTO token_transfers
       (chain_id, transaction_hash, log_index, token_address, from_address, to_address,
        amount, block_number, timestamp)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, to_timestamp($9))
     ON CONFLICT (chain_id, transaction_hash, log_index) DO NOTHING`,
    [
      config.CHAIN_ID,
      t.txHash,
      t.logIndex,
      t.token,
      t.from,
      t.to,
      t.amount.toString(),
      t.blockNumber.toString(),
      t.timestamp,
    ]
  );
}

async function insertSwap(
  client: PoolClient,
  s: DecodedSwap,
  dex: string,
  usdValue: number | null,
  price: number | null
): Promise<void> {
  await client.query(
    `INSERT INTO swaps
       (chain_id, transaction_hash, log_index, pool_address, dex, wallet_address,
        token_in, token_out, amount_in, amount_out, usd_value, price, block_number, timestamp)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, to_timestamp($14))
     ON CONFLICT (chain_id, transaction_hash, log_index) DO NOTHING`,
    [
      config.CHAIN_ID,
      s.txHash,
      s.logIndex,
      s.poolAddress,
      dex,
      s.walletAddress,
      s.tokenIn,
      s.tokenOut,
      s.amountIn.toString(),
      s.amountOut.toString(),
      usdValue,
      price,
      s.blockNumber.toString(),
      s.timestamp,
    ]
  );
}

async function insertLiquidityEvent(
  client: PoolClient,
  e: DecodedLiquidityEvent,
  _dex: string
): Promise<void> {
  await client.query(
    `INSERT INTO liquidity_events
       (chain_id, transaction_hash, log_index, pool_address, wallet_address, event_type,
        amount0, amount1, block_number, timestamp)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, to_timestamp($10))
     ON CONFLICT (chain_id, transaction_hash, log_index) DO NOTHING`,
    [
      config.CHAIN_ID,
      e.txHash,
      e.logIndex,
      e.poolAddress,
      e.walletAddress,
      e.eventType,
      e.amount0.toString(),
      e.amount1.toString(),
      e.blockNumber.toString(),
      e.timestamp,
    ]
  );
}

async function upsertTraderWallet(
  client: PoolClient,
  address: Hex,
  block: bigint,
  timestamp: number
): Promise<void> {
  await client.query(
    `INSERT INTO wallets (chain_id, address, first_seen_block, last_seen_block, first_seen_at, last_seen_at)
     VALUES ($1,$2,$3,$3, to_timestamp($4), to_timestamp($4))
     ON CONFLICT (chain_id, address) DO UPDATE SET
       first_seen_block = LEAST(wallets.first_seen_block, EXCLUDED.first_seen_block),
       last_seen_block  = GREATEST(wallets.last_seen_block, EXCLUDED.last_seen_block),
       first_seen_at = LEAST(wallets.first_seen_at, EXCLUDED.first_seen_at),
       last_seen_at  = GREATEST(wallets.last_seen_at, EXCLUDED.last_seen_at)`,
    [config.CHAIN_ID, address, block.toString(), timestamp]
  );
}
