import type { Hex } from "viem";
import { query } from "../db/pool.js";
import { config } from "../config/index.js";
import { logger } from "../config/logger.js";
import { normalizeAddress } from "../lib/address.js";
import { mapWithConcurrency } from "../lib/concurrency.js";
import { fetchTokenMetadata } from "../chain/erc20.js";
import { identifyPool } from "../dex/poolIdentify.js";
import { contracts, isStablecoin, isWeth } from "../dex/contracts.js";
import type { KnownPool } from "../dex/adapter.js";

const RPC_CONCURRENCY = 6;

export interface TokenInfo {
  address: Hex;
  decimals: number;
  symbol: string | null;
}

// In-memory caches. Positives are also durable in Postgres; the negative
// pool cache is process-local (cleared on restart, which is fine).
const tokenCache = new Map<string, TokenInfo>();
const poolCache = new Map<string, KnownPool>();
const notPool = new Set<string>();

function classifyToken(address: string): string {
  if (isWeth(address)) return "wrapped_native";
  if (isStablecoin(address)) return "stablecoin";
  return "unknown";
}

export function decimalsOf(address: string): number {
  return tokenCache.get(address.toLowerCase())?.decimals ?? 18;
}

/** Ensure every address is present in `tokens` (discovering + caching as needed). */
export async function ensureTokens(addresses: string[], createdBlock: bigint): Promise<void> {
  const uniq = [...new Set(addresses.map((a) => a.toLowerCase()))].filter((a) => !tokenCache.has(a));
  if (uniq.length === 0) return;

  const { rows } = await query<{ address: string; decimals: number | null; symbol: string | null }>(
    `SELECT address, decimals, symbol FROM tokens WHERE chain_id = $1 AND address = ANY($2)`,
    [config.CHAIN_ID, uniq]
  );
  for (const r of rows) {
    tokenCache.set(r.address, {
      address: r.address as Hex,
      decimals: r.decimals ?? 18,
      symbol: r.symbol,
    });
  }

  const undiscovered = uniq.filter((a) => !tokenCache.has(a));
  await mapWithConcurrency(undiscovered, RPC_CONCURRENCY, async (address) => {
    try {
      const md = await fetchTokenMetadata(address as Hex);
      await query(
        `INSERT INTO tokens
           (chain_id, address, name, symbol, decimals, total_supply, token_type,
            created_block, metadata_fetched_at, discovery_failed)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now(), $9)
         ON CONFLICT (chain_id, address) DO UPDATE SET
           name = COALESCE(EXCLUDED.name, tokens.name),
           symbol = COALESCE(EXCLUDED.symbol, tokens.symbol),
           decimals = COALESCE(EXCLUDED.decimals, tokens.decimals),
           total_supply = COALESCE(EXCLUDED.total_supply, tokens.total_supply),
           metadata_fetched_at = now(),
           discovery_failed = EXCLUDED.discovery_failed`,
        [
          config.CHAIN_ID,
          address,
          md.name,
          md.symbol,
          md.decimals,
          md.totalSupply?.toString() ?? null,
          classifyToken(address),
          createdBlock.toString(),
          !md.looksLikeToken,
        ]
      );
      tokenCache.set(address, {
        address: address as Hex,
        decimals: md.decimals ?? 18,
        symbol: md.symbol,
      });
    } catch (err) {
      logger.warn({ address, err: (err as Error).message }, "token discovery failed");
    }
  });
}

function rowToPool(r: {
  address: string;
  dex: string;
  pool_type: string | null;
  token0: string;
  token1: string;
  fee_tier: string | null;
  factory: string | null;
}): KnownPool {
  return {
    address: r.address as Hex,
    dex: r.dex,
    poolType: (r.pool_type as "v2" | "v3") ?? "v2",
    token0: r.token0 as Hex,
    token1: r.token1 as Hex,
    feeTier: r.fee_tier != null ? Number(r.fee_tier) : null,
    factory: (r.factory as Hex) ?? null,
  };
}

/**
 * Resolve a set of candidate pool addresses (contracts that emitted a swap-shaped
 * log) to `KnownPool`s, discovering + persisting any we haven't seen. Addresses
 * that turn out not to be pools are remembered so we don't re-probe them.
 */
export async function resolvePools(
  addresses: string[],
  createdBlock: bigint
): Promise<Map<string, KnownPool>> {
  const out = new Map<string, KnownPool>();
  const toLookUp: string[] = [];
  for (const raw of new Set(addresses.map((a) => a.toLowerCase()))) {
    const cached = poolCache.get(raw);
    if (cached) out.set(raw, cached);
    else if (!notPool.has(raw)) toLookUp.push(raw);
  }
  if (toLookUp.length === 0) return out;

  const { rows } = await query(
    `SELECT address, dex, pool_type, token0, token1, fee_tier, factory
       FROM pools WHERE chain_id = $1 AND address = ANY($2)`,
    [config.CHAIN_ID, toLookUp]
  );
  for (const r of rows as Parameters<typeof rowToPool>[0][]) {
    const kp = rowToPool(r);
    poolCache.set(kp.address, kp);
    out.set(kp.address, kp);
  }

  const undiscovered = toLookUp.filter((a) => !out.has(a));
  await mapWithConcurrency(undiscovered, RPC_CONCURRENCY, async (address) => {
    let kp: KnownPool | null = null;
    try {
      kp = await identifyPool(address as Hex);
    } catch (err) {
      logger.warn({ address, err: (err as Error).message }, "pool identify failed");
    }
    if (!kp) {
      notPool.add(address);
      return;
    }
    await ensureTokens([kp.token0, kp.token1], createdBlock);
    await persistPool(kp, createdBlock);
    out.set(address, kp);
  });

  return out;
}

/**
 * Bulk-insert bare token rows (address only, no metadata) for a set of
 * addresses. Used by the pool backfill so a wide scan doesn't do an RPC +
 * several DB round-trips per token — `sweepTokenMetadata` / lazy lookup /
 * the live decode pass fill in name/symbol/decimals later.
 */
export async function insertBareTokens(addresses: string[], createdBlock: bigint): Promise<void> {
  const uniq = [...new Set(addresses.map((a) => a.toLowerCase()))].filter(
    (a) => a !== "0x0000000000000000000000000000000000000000"
  );
  if (uniq.length === 0) return;
  await query(
    `INSERT INTO tokens (chain_id, address, token_type, created_block)
       SELECT $1, addr, $3, $4 FROM unnest($2::text[]) AS addr
     ON CONFLICT (chain_id, address) DO NOTHING`,
    [config.CHAIN_ID, uniq, "unknown", createdBlock.toString()]
  );
}

/** Bulk-insert pools discovered from factory events. Idempotent. */
export async function persistPoolsBatch(pools: KnownPool[], createdBlock: bigint): Promise<void> {
  if (pools.length === 0) return;
  const values: unknown[] = [config.CHAIN_ID, createdBlock.toString()];
  const rows = pools.map((p, i) => {
    const b = i * 7;
    values.push(p.address, p.dex, p.poolType, p.token0, p.token1, p.feeTier, p.factory);
    return `($1, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}, $2)`;
  });
  await query(
    `INSERT INTO pools
       (chain_id, address, dex, pool_type, token0, token1, fee_tier, factory, created_block)
     VALUES ${rows.join(", ")}
     ON CONFLICT (chain_id, address) DO NOTHING`,
    values
  );
  for (const p of pools) poolCache.set(p.address.toLowerCase(), p);
}

/**
 * Fill name/symbol/decimals/total_supply for tokens that only have a bare row
 * (from the pool backfill). Processes up to `limit` per call, RPC-concurrency
 * limited. Returns how many it resolved.
 */
export async function sweepTokenMetadata(limit = 200): Promise<number> {
  const { rows } = await query<{ address: string }>(
    `SELECT address FROM tokens
      WHERE chain_id = $1 AND metadata_fetched_at IS NULL
      ORDER BY created_block NULLS FIRST
      LIMIT $2`,
    [config.CHAIN_ID, limit]
  );
  if (rows.length === 0) return 0;
  let done = 0;
  await mapWithConcurrency(rows, RPC_CONCURRENCY, async ({ address }) => {
    try {
      const md = await fetchTokenMetadata(address as Hex);
      await query(
        `UPDATE tokens SET
           name = COALESCE($3, name), symbol = COALESCE($4, symbol),
           decimals = COALESCE($5, decimals), total_supply = COALESCE($6, total_supply),
           token_type = $7, metadata_fetched_at = now(), discovery_failed = $8
         WHERE chain_id = $1 AND address = $2`,
        [
          config.CHAIN_ID,
          address,
          md.name,
          md.symbol,
          md.decimals,
          md.totalSupply?.toString() ?? null,
          classifyToken(address),
          !md.looksLikeToken,
        ]
      );
      if (md.decimals != null)
        tokenCache.set(address, { address: address as Hex, decimals: md.decimals, symbol: md.symbol });
      done++;
    } catch (err) {
      logger.warn({ address, err: (err as Error).message }, "token metadata sweep failed");
    }
  });
  return done;
}

/** Insert a known pool + warm the cache. Idempotent. */
export async function persistPool(kp: KnownPool, createdBlock: bigint): Promise<void> {
  await query(
    `INSERT INTO pools
       (chain_id, address, dex, pool_type, token0, token1, fee_tier, factory, created_block)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (chain_id, address) DO NOTHING`,
    [
      config.CHAIN_ID,
      kp.address,
      kp.dex,
      kp.poolType,
      kp.token0,
      kp.token1,
      kp.feeTier,
      kp.factory,
      createdBlock.toString(),
    ]
  );
  poolCache.set(kp.address.toLowerCase(), kp);
}

/**
 * On-demand single-token resolution for the API: return the token row,
 * discovering it via RPC if we've never seen it. Returns null when the address
 * isn't an ERC-20 (no `decimals()`), so the caller can 404.
 */
export async function discoverTokenOnDemand(
  addressRaw: string
): Promise<{ address: string; symbol: string | null; decimals: number | null } | null> {
  const address = normalizeAddress(addressRaw);
  const existing = await query<{ address: string; symbol: string | null; decimals: number | null }>(
    `SELECT address, symbol, decimals FROM tokens WHERE chain_id = $1 AND address = $2`,
    [config.CHAIN_ID, address]
  );
  if (existing.rows[0]) return existing.rows[0];

  const md = await fetchTokenMetadata(address as Hex);
  if (!md.looksLikeToken) return null;

  await query(
    `INSERT INTO tokens
       (chain_id, address, name, symbol, decimals, total_supply, token_type,
        metadata_fetched_at, discovery_failed)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now(), false)
     ON CONFLICT (chain_id, address) DO UPDATE SET
       name = COALESCE(EXCLUDED.name, tokens.name),
       symbol = COALESCE(EXCLUDED.symbol, tokens.symbol),
       decimals = COALESCE(EXCLUDED.decimals, tokens.decimals),
       total_supply = COALESCE(EXCLUDED.total_supply, tokens.total_supply),
       metadata_fetched_at = now()`,
    [
      config.CHAIN_ID,
      address,
      md.name,
      md.symbol,
      md.decimals,
      md.totalSupply?.toString() ?? null,
      classifyToken(address),
    ]
  );
  tokenCache.set(address, { address: address as Hex, decimals: md.decimals ?? 18, symbol: md.symbol });
  return { address, symbol: md.symbol, decimals: md.decimals };
}

/** Wipe caches — used by tests and after a reorg rewind. */
export function _resetEntityCaches(): void {
  tokenCache.clear();
  poolCache.clear();
  notPool.clear();
}

export { normalizeAddress, contracts };
