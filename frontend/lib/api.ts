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
  first_seen: string | null;
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

export type TokenSort = "volume" | "liquidity" | "fdv" | "recent" | "new";

export interface TokenDetail extends TokenRow {
  total_supply: string | null;
  logo_url: string | null;
  created_block: string | null;
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

// ---- Wallet Passport ----

export interface WalletSummary {
  has_trades: boolean;
  portfolio_value: string | null;
  realized_pnl: string | null;
  unrealized_pnl: string | null;
  total_pnl: string | null;
  total_trades: number | null;
  winning_trades: number | null;
  losing_trades: number | null;
  win_rate: string | null;
  total_volume: string | null;
  buy_volume: string | null;
  sell_volume: string | null;
  best_trade_pnl: string | null;
  worst_trade_pnl: string | null;
  average_win: string | null;
  average_loss: string | null;
  roi: string | null;
  tokens_traded: number | null;
  open_positions: number | null;
  closed_positions: number | null;
  first_trade_at: string | null;
  last_trade_at: string | null;
  avg_holding_hours: string | null;
  breakeven_trades: number | null;
  pnl_confidence: "high" | "medium" | "low" | null;
  unmatched_pnl: string | null;
  zero_cost_positions: number | null;
  indexed_through_block: string | null;
  computed_at: string | null;
}

export interface WalletPosition {
  token_address: string;
  quantity: string;
  average_cost: string;
  cost_basis: string;
  realized_pnl: string;
  unrealized_pnl: string;
  current_price: string | null;
  current_value: string | null;
  is_open: boolean;
  buy_usd: string;
  sell_usd: string;
  first_buy_at: string | null;
  last_activity_at: string | null;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  market_price: string | null;
}

export interface WalletTrade {
  token_address: string;
  side: "buy" | "sell";
  quantity: string;
  price: string | null;
  usd_value: string | null;
  cost_basis: string | null;
  realized_pnl: string | null;
  dex: string | null;
  tx_hash: string;
  timestamp: string;
  symbol: string | null;
  decimals: number | null;
}

export interface WalletTransaction {
  hash: string;
  block_number: string;
  transaction_index: number;
  from_address: string;
  to_address: string | null;
  value: string;
  gas_used: string | null;
  gas_price: string | null;
  status: number | null;
  timestamp: string;
}

export function fetchWallet(address: string, refresh = false, signal?: AbortSignal) {
  return get<WalletSummary>(`/api/v1/wallets/${address}${refresh ? "?refresh=1" : ""}`, {
    signal,
  });
}

export function fetchWalletPositions(address: string, signal?: AbortSignal) {
  return get<{ wallet: string; count: number; positions: WalletPosition[] }>(
    `/api/v1/wallets/${address}/positions`,
    { signal }
  );
}

export function fetchWalletTrades(address: string, limit = 50, signal?: AbortSignal) {
  return get<{ wallet: string; count: number; trades: WalletTrade[] }>(
    `/api/v1/wallets/${address}/trades?limit=${limit}`,
    { signal }
  );
}

export function fetchWalletTransactions(address: string, limit = 50, signal?: AbortSignal) {
  return get<{ address: string; count: number; transactions: WalletTransaction[] }>(
    `/api/v1/wallets/${address}/transactions?limit=${limit}`,
    { signal }
  );
}

// ---- HoodMap view (holder bubble map) ----

export type WalletRole =
  | "deployer"
  | "liquidity"
  | "burn"
  | "insider"
  | "sniper"
  | "whale"
  | "holder";

export interface MapNode {
  address: string;
  balance: string;
  pct: number;
  isPool: boolean;
  isBurn: boolean;
  funder: string | null;
  funderKind: "token" | "native" | null;
  clusterId: string | null;
  role: WalletRole;
}

export interface MapEdge {
  from: string;
  to: string;
  kind: "token" | "native" | "chain";
  directed: boolean;
}

export interface MapCluster {
  id: string;
  funder: string;
  members: string[];
  memberCount: number;
  totalPct: number;
}

export interface TokenMap {
  address: string;
  holderCount: number;
  clusteredPct: number;
  nodes: MapNode[];
  edges: MapEdge[];
  clusters: MapCluster[];
  note?: string;
}

export function fetchTokenMap(address: string, signal?: AbortSignal) {
  return get<TokenMap>(`/api/v1/tokens/${address}/map`, { signal });
}

export interface WalletTokenActivity {
  address: string;
  wallet: string;
  inflow: { total: string; counterparties: number };
  outflow: { total: string; counterparties: number };
  transferCount: number;
  recentTransfers: {
    hash: string;
    direction: "in" | "out";
    counterparty: string;
    amount: string;
    blockNumber: string;
    timestamp: string;
  }[];
}

export function fetchWalletTokenActivity(address: string, wallet: string, signal?: AbortSignal) {
  return get<WalletTokenActivity>(`/api/v1/tokens/${address}/holders/${wallet}`, { signal });
}
