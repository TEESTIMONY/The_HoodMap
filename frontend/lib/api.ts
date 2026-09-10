/**
 * Thin client for the HoodMap analytics API. Requests go to a same-origin
 * `/api/*` path that Next rewrites to the backend (see next.config.mjs), so
 * there's no CORS and no public base-URL to leak.
 */

export interface TokenRow {
  address: string;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  token_type: string | null;
  verified: boolean;
  price: string | null;
  price_native: string | null;
  market_cap: string | null;
  fdv: string | null;
  liquidity_usd: string | null;
  volume_24h: string | null;
  volume_6h: string | null;
  buy_count_24h: number | null;
  sell_count_24h: number | null;
  pool_count: number | null;
  price_confidence: "high" | "medium" | "low" | null;
  last_trade_at: string | null;
}

export interface MarketStats {
  tokens: number;
  pools: number;
  swaps_24h: number;
  active_wallets_24h: number;
  volume_24h: string;
  liquidity_usd: string;
  weth_usd: string | null;
}

export type TokenSort = "volume" | "liquidity" | "fdv" | "recent";

async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export function fetchTokens(sort: TokenSort, limit = 50, signal?: AbortSignal) {
  return get<{ count: number; tokens: TokenRow[] }>(
    `/api/v1/tokens?sort=${sort}&limit=${limit}`,
    { signal }
  );
}

export function fetchStats(signal?: AbortSignal) {
  return get<MarketStats>("/api/v1/stats", { signal });
}
