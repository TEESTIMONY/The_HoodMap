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
    poolCache.set(address, kp);
    out.set(address, kp);
  });

  return out;
}

/** Wipe caches — used by tests and after a reorg rewind. */
export function _resetEntityCaches(): void {
  tokenCache.clear();
  poolCache.clear();
  notPool.clear();
}

export { normalizeAddress, contracts };
