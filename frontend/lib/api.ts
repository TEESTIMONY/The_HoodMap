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

export interface TokenDetail extends TokenRow {
  total_supply: string | null;
  logo_url: string | null;
  created_block: string | null;
  first_seen: string | null;
  volume_1h: string | null;
  stats_updated_at: string | null;
}

export interface TokenSwap {
  transaction_hash: string;
  log_index: number;
  wallet_address: string;
  dex: string;
  pool_address: string;
  usd_value: string | null;
  block_number: string;
  timestamp: string;
  side: "buy" | "sell";
  token_amount: string;
}

export interface ReportPool {
  address: string;
  dex: string;
  liquidity_usd: string | null;
  volume_24h: string | null;
  sym0: string | null;
  sym1: string | null;
}

export interface TokenReport {
  pools: ReportPool[];
  holders: {
    count: number;
    transfers: number;
    top1_pct: number;
    top10_pct: number;
    pool_pct: number;
    top: { address: string; pct: number; is_pool: boolean; is_burn: boolean }[];
  } | null;
  hoodscore: { grade: "A" | "B" | "C" | "D" | "E" | "F"; score: number; reasons: string[] } | null;
  note?: string;
}

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

export function fetchToken(address: string, signal?: AbortSignal) {
  return get<TokenDetail>(`/api/v1/tokens/${address}`, { signal });
}

export function fetchTokenSwaps(address: string, limit = 40, signal?: AbortSignal) {
  return get<{ token: string; count: number; swaps: TokenSwap[] }>(
    `/api/v1/tokens/${address}/swaps?limit=${limit}`,
    { signal }
  );
}

export function fetchTokenReport(address: string, signal?: AbortSignal) {
  return get<TokenReport>(`/api/v1/tokens/${address}/report`, { signal });
}
