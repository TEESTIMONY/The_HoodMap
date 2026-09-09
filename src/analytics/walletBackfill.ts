import type { Hex } from "viem";
import { parseUnits } from "viem";
import { query } from "../db/pool.js";
import { config } from "../config/index.js";
import { logger } from "../config/logger.js";
import { normalizeAddress, normalizeAddressOrNull } from "../lib/address.js";
import { mapWithConcurrency } from "../lib/concurrency.js";
import { getReceipt, getWalletTransfers } from "../chain/assetTransfers.js";
import { processContextualLogs } from "../decode/index.js";
import type { RawLogInput, TxContext } from "../dex/adapter.js";

const MAX_TX = 600;
const RECEIPT_CONCURRENCY = 10;
const FRESH_MS = 10 * 60 * 1000;

const kind = (address: string): string => `wallet:${address}`;

async function backfillCursor(address: string): Promise<{ block: number; updatedAt: number } | null> {
  const { rows } = await query<{ last_block: string; updated_at: string }>(
    `SELECT last_block, updated_at FROM backfill_state WHERE chain_id = $1 AND kind = $2`,
    [config.CHAIN_ID, kind(normalizeAddress(address))]
  );
  return rows[0]
    ? { block: Number(rows[0].last_block), updatedAt: new Date(rows[0].updated_at).getTime() }
    : null;
}

/** True if this wallet was backfilled from chain history within FRESH_MS. */
export async function walletIsFresh(address: string): Promise<boolean> {
  const c = await backfillCursor(address);
  return !!c && Date.now() - c.updatedAt < FRESH_MS;
}

/**
 * Pull a wallet's full transfer history from Alchemy, fetch receipts for the txs
 * that moved an ERC-20 (swap candidates), and run them through the decode core —
 * so scanning any wallet works without the indexer having reached its blocks.
 */
export async function backfillWalletTrades(
  addressRaw: string
): Promise<{ txScanned: number; swaps: number; truncated: boolean }> {
  const address = normalizeAddress(addressRaw);
  // Incremental refresh: if we've scanned this wallet before, only fetch
  // transfers from a bit before the last block we reached.
  const prev = await backfillCursor(address);
  const fromBlock = prev && prev.block > 0 ? Math.max(0, prev.block - 5) : 0;
  const transfers = await getWalletTransfers(address, 5, fromBlock);

  const meta = new Map<string, { block: number; ts: number; ethValue: number }>();
  const erc20Hashes = new Set<string>();
  for (const t of transfers) {
    const m = meta.get(t.hash);
    if (m) m.ethValue += t.ethValue;
    else meta.set(t.hash, { block: t.blockNum, ts: t.timestamp, ethValue: t.ethValue });
    if (t.category === "erc20") erc20Hashes.add(t.hash);
  }

  const candidates = [...erc20Hashes];
  // Skip txs we've already decoded a swap *for this wallet*. A tx decoded only
  // for someone else (e.g. attributed to a bundler by the indexer) is re-run so
  // we can re-attribute it.
  const decodedRows = await query<{ transaction_hash: string }>(
    `SELECT DISTINCT transaction_hash FROM swaps
      WHERE chain_id = $1 AND wallet_address = $2 AND transaction_hash = ANY($3)`,
    [config.CHAIN_ID, address, candidates]
  );
  const decoded = new Set(decodedRows.rows.map((r) => r.transaction_hash));

  let toFetch = candidates
    .filter((h) => !decoded.has(h))
    .sort((a, b) => (meta.get(b)?.block ?? 0) - (meta.get(a)?.block ?? 0));
  const truncated = toFetch.length > MAX_TX;
  toFetch = toFetch.slice(0, MAX_TX);

  if (toFetch.length === 0) {
    await touch(address, 0n);
    return { txScanned: 0, swaps: 0, truncated };
  }

  const receipts = await mapWithConcurrency(toFetch, RECEIPT_CONCURRENCY, (h) => getReceipt(h));

  const logs: { log: RawLogInput; ctx: TxContext }[] = [];
  const txRows: unknown[][] = [];
  let maxBlock = 0n;

  for (const r of receipts) {
    if (!r || r.status !== "success") continue;
    const m = meta.get(r.transactionHash.toLowerCase());
    if (!m) continue;
    const blockNumber = BigInt(m.block);
    if (blockNumber > maxBlock) maxBlock = blockNumber;

    const ctx: TxContext = {
      txFrom: normalizeAddress(r.from),
      txHash: r.transactionHash as Hex,
      blockNumber,
      timestamp: m.ts,
    };
    for (const lg of r.logs) {
      logs.push({
        log: {
          address: normalizeAddress(lg.address),
          topics: lg.topics as readonly Hex[],
          data: lg.data,
          logIndex: lg.logIndex ?? 0,
        },
        ctx,
      });
    }

    txRows.push([
      config.CHAIN_ID,
      r.transactionHash,
      m.block.toString(),
      r.blockHash,
      r.transactionIndex ?? 0,
      normalizeAddress(r.from),
      normalizeAddressOrNull(r.to),
      m.ethValue > 0 ? parseUnits(String(m.ethValue), 18).toString() : "0",
      r.gasUsed?.toString() ?? null,
      r.effectiveGasPrice?.toString() ?? null,
      1,
      m.ts,
    ]);
  }

  await insertTransactions(txRows);
  // Only swaps matter for PnL — skip writing token_transfers. Attribute swaps to
  // this wallet (tx.from is a bundler for smart-account wallets).
  const summary = await processContextualLogs(logs, maxBlock, {
    includeTransfers: false,
    attributeSwapsTo: address,
  });
  await touch(address, maxBlock);

  logger.info(
    { wallet: address, txScanned: toFetch.length, swaps: summary.swaps, truncated },
    "wallet history backfilled"
  );
  return { txScanned: toFetch.length, swaps: summary.swaps, truncated };
}

async function insertTransactions(rows: unknown[][]): Promise<void> {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const values: unknown[] = [];
    const tuples = chunk.map((r, j) => {
      const b = j * 12;
      values.push(...r);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11}, to_timestamp($${b + 12}))`;
    });
    await query(
      `INSERT INTO transactions
         (chain_id, hash, block_number, block_hash, transaction_index, from_address, to_address,
          value, gas_used, gas_price, status, timestamp)
       VALUES ${tuples.join(", ")}
       ON CONFLICT (chain_id, hash) DO NOTHING`,
      values
    );
  }
}

async function touch(address: string, maxBlock: bigint): Promise<void> {
  await query(
    `INSERT INTO backfill_state (chain_id, kind, last_block, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (chain_id, kind) DO UPDATE SET
       last_block = GREATEST(backfill_state.last_block, EXCLUDED.last_block), updated_at = now()`,
    [config.CHAIN_ID, kind(address), maxBlock.toString()]
  );
}
