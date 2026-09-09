import type { Hex } from "viem";
import type { PoolClient } from "pg";
import { withTransaction } from "../db/pool.js";
import { config } from "../config/index.js";
import { logger } from "../config/logger.js";
import { addressFromTopic, normalizeAddress } from "../lib/address.js";
import type { RawBlock, RawReceipt } from "../indexer/types.js";
import type { DecodedLiquidityEvent, DecodedSwap, RawLogInput, TxContext } from "../dex/adapter.js";
import {
  isV4SwapTopic,
  liquidityDecoderForTopic,
  swapDecoderForTopic,
  watchedLiquidityTopics,
  watchedSwapTopics,
} from "../dex/registry.js";
import { ERC20_TRANSFER_TOPIC, V4_INITIALIZE_TOPIC, V4_MODIFY_LIQUIDITY_TOPIC } from "../dex/events.js";
import { parseV4Initialize } from "../dex/uniswapV4.js";
import { decimalsOf, ensureTokens, persistV4Pools, resolvePools, resolveV4Pools } from "./entities.js";
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

  return processContextualLogs(logs, block.number);
}

/**
 * The decode core: given already-contextualised logs (from a full block, or a
 * targeted set of receipts during a wallet backfill), discover tokens/pools and
 * write token_transfers / swaps / liquidity_events. `atBlock` is only used to
 * stamp `created_block` on newly discovered entities.
 */
export async function processContextualLogs(
  logs: Contextualised[],
  atBlock: bigint,
  opts: { includeTransfers?: boolean; attributeSwapsTo?: string } = {}
): Promise<DecodeSummary> {
  const includeTransfers = opts.includeTransfers ?? true;
  const attributeTo = opts.attributeSwapsTo?.toLowerCase();
  // Always parse Transfer logs (needed for swap attribution); write them only
  // when asked.
  const transferLogs = logs.filter(({ log }) => log.topics[0] === ERC20_TRANSFER_TOPIC);
  const swapLogs = logs.filter(({ log }) => log.topics[0] && watchedSwapTopics.has(log.topics[0]));
  const liquidityLogs = logs.filter(
    ({ log }) => log.topics[0] && watchedLiquidityTopics.has(log.topics[0])
  );
  const v4InitLogs = logs.filter(({ log }) => log.topics[0] === V4_INITIALIZE_TOPIC);

  // The "pool key" is the emitting contract for V2/V3, but topic1 (the PoolId)
  // for V4. Look up each family against its own table.
  const poolKey = (log: RawLogInput): string =>
    isV4SwapTopic(log.topics[0]) || log.topics[0] === V4_MODIFY_LIQUIDITY_TOPIC
      ? (log.topics[1] ?? log.address)
      : log.address;
  const isV4 = (log: RawLogInput): boolean =>
    isV4SwapTopic(log.topics[0]) || log.topics[0] === V4_MODIFY_LIQUIDITY_TOPIC;

  // ---- discovery (RPC, outside the write txn) ----
  const eventLogs = [...swapLogs, ...liquidityLogs];
  const v2v3Addrs = [...new Set(eventLogs.filter((e) => !isV4(e.log)).map((e) => e.log.address))];
  const v4Ids = [...new Set(eventLogs.filter((e) => isV4(e.log)).map((e) => e.log.topics[1] ?? ""))].filter(Boolean);

  // Persist V4 pools from Initialize events first (so their swaps resolve).
  const newV4 = v4InitLogs
    .map(({ log }) => parseV4Initialize(log))
    .filter((p): p is NonNullable<typeof p> => p !== null);
  if (newV4.length) {
    await ensureTokens(newV4.flatMap((p) => [p.token0, p.token1]), atBlock);
    await persistV4Pools(newV4, atBlock);
  }

  const [v2v3Pools, v4Pools] = await Promise.all([
    resolvePools(v2v3Addrs, atBlock),
    resolveV4Pools(v4Ids, atBlock),
  ]);
  const pools = new Map([...v2v3Pools, ...v4Pools]);

  const transfers = transferLogs
    .map(({ log, ctx }) => parseTransfer(log, ctx))
    .filter((t): t is ParsedTransfer => t !== null);
  // Load metadata (decimals!) for every token we'll touch — transfer tokens AND
  // pool tokens. resolvePools/resolveV4Pools skip this for DB-cached pools, so
  // without it `decimalsOf` falls back to 18 and pricing is off by 10^(18-dec).
  await ensureTokens(
    [...transfers.map((t) => t.token), ...[...pools.values()].flatMap((p) => [p.token0, p.token1])],
    atBlock
  );

  // ---- decode ----
  // On a wallet scan the tx.from is often a bundler/relayer (ERC-4337 / EIP-7702
  // smart accounts), not the trader. The caller only feeds us receipts for txs
  // where the target wallet moved a token, and `reconstructTrades` nets per tx,
  // so attribute every swap in the set to that wallet. Only keep txs where the
  // wallet actually touched a token (guards against a shared-bundle tx where the
  // wallet's own op was a plain transfer).
  const walletTxs = new Set<string>();
  if (attributeTo) {
    for (const t of transfers) {
      if (t.from === attributeTo || t.to === attributeTo) walletTxs.add(t.txHash);
    }
  }

  const swaps: { swap: DecodedSwap; dex: string }[] = [];
  for (const { log, ctx } of swapLogs) {
    const pool = pools.get(poolKey(log));
    const decoder = swapDecoderForTopic(log.topics[0]);
    if (!pool || !decoder) continue;
    const swap = decoder.decodeSwap(log, pool, ctx);
    if (!swap) continue;
    if (attributeTo) {
      if (!walletTxs.has(swap.txHash)) continue;
      swap.walletAddress = attributeTo as `0x${string}`;
    }
    swaps.push({ swap, dex: pool.dex });
  }

  const liquidityEvents: { event: DecodedLiquidityEvent; dex: string }[] = [];
  for (const { log, ctx } of liquidityLogs) {
    const pool = pools.get(poolKey(log));
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
    if (includeTransfers) await insertTransfersBatch(client, transfers);
    await insertSwapsBatch(
      client,
      swaps.map(({ swap, dex }) => {
        const p = pricing.get(`${swap.txHash}:${swap.logIndex}`);
        return { swap, dex, usdValue: p?.usdValue ?? null, price: p?.price ?? null };
      }),
      // On a targeted wallet scan, our attribution beats the indexer's tx.from
      // guess, so overwrite wallet_address on conflict.
      { updateWallet: !!attributeTo }
    );
    await upsertTradersBatch(client, swaps.map((s) => s.swap));
    for (const { event, dex } of liquidityEvents) await insertLiquidityEvent(client, event, dex);
  });

  return {
    transfers: includeTransfers ? transfers.length : 0,
    swaps: swaps.length,
    liquidityEvents: liquidityEvents.length,
  };
}

const CHUNK = 400;

async function insertTransfersBatch(client: PoolClient, rows: ParsedTransfer[]): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const vals: unknown[] = [config.CHAIN_ID];
    const tuples = chunk.map((t, j) => {
      const b = j * 8;
      vals.push(t.txHash, t.logIndex, t.token, t.from, t.to, t.amount.toString(), t.blockNumber.toString(), t.timestamp);
      return `($1,$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8}, to_timestamp($${b + 9}))`;
    });
    await client.query(
      `INSERT INTO token_transfers
         (chain_id, transaction_hash, log_index, token_address, from_address, to_address, amount, block_number, timestamp)
       VALUES ${tuples.join(",")}
       ON CONFLICT (chain_id, transaction_hash, log_index) DO NOTHING`,
      vals
    );
  }
}

async function insertSwapsBatch(
  client: PoolClient,
  rows: { swap: DecodedSwap; dex: string; usdValue: number | null; price: number | null }[],
  opts: { updateWallet?: boolean } = {}
): Promise<void> {
  const onConflict = opts.updateWallet
    ? `ON CONFLICT (chain_id, transaction_hash, log_index)
         DO UPDATE SET wallet_address = EXCLUDED.wallet_address`
    : `ON CONFLICT (chain_id, transaction_hash, log_index) DO NOTHING`;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const vals: unknown[] = [config.CHAIN_ID];
    const tuples = chunk.map(({ swap: s, dex, usdValue, price }, j) => {
      const b = j * 13;
      vals.push(
        s.txHash, s.logIndex, s.poolAddress, dex, s.walletAddress, s.tokenIn, s.tokenOut,
        s.amountIn.toString(), s.amountOut.toString(), usdValue, price, s.blockNumber.toString(), s.timestamp
      );
      return `($1,$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13}, to_timestamp($${b + 14}))`;
    });
    await client.query(
      `INSERT INTO swaps
         (chain_id, transaction_hash, log_index, pool_address, dex, wallet_address,
          token_in, token_out, amount_in, amount_out, usd_value, price, block_number, timestamp)
       VALUES ${tuples.join(",")}
       ${onConflict}`,
      vals
    );
  }
}

async function upsertTradersBatch(client: PoolClient, swaps: DecodedSwap[]): Promise<void> {
  const seen = new Map<string, { block: bigint; ts: number }>();
  for (const s of swaps) {
    const cur = seen.get(s.walletAddress);
    if (!cur || s.blockNumber > cur.block) seen.set(s.walletAddress, { block: s.blockNumber, ts: s.timestamp });
  }
  const entries = [...seen.entries()];
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    const vals: unknown[] = [config.CHAIN_ID];
    const tuples = chunk.map(([addr, { block, ts }], j) => {
      const b = j * 3;
      vals.push(addr, block.toString(), ts);
      return `($1,$${b + 2},$${b + 3},$${b + 3}, to_timestamp($${b + 4}), to_timestamp($${b + 4}))`;
    });
    await client.query(
      `INSERT INTO wallets (chain_id, address, first_seen_block, last_seen_block, first_seen_at, last_seen_at)
       VALUES ${tuples.join(",")}
       ON CONFLICT (chain_id, address) DO UPDATE SET
         first_seen_block = LEAST(wallets.first_seen_block, EXCLUDED.first_seen_block),
         last_seen_block  = GREATEST(wallets.last_seen_block, EXCLUDED.last_seen_block),
         first_seen_at = LEAST(wallets.first_seen_at, EXCLUDED.first_seen_at),
         last_seen_at  = GREATEST(wallets.last_seen_at, EXCLUDED.last_seen_at)`,
      vals
    );
  }
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

