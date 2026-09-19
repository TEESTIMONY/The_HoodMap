/**
 * Pure formatting for the Telegram bot: API JSON in, Telegram-HTML strings out.
 * No I/O, so it's unit-testable. Every on-chain string (token name/symbol) is
 * attacker-controlled — anyone can deploy a token called `<a href=...>` — so
 * everything interpolated into a message goes through escapeHtml().
 */

export interface TokenDetail {
  address: string;
  symbol: string | null;
  name: string | null;
  token_type: string | null;
  price: string | null;
  market_cap: string | null;
  fdv: string | null;
  liquidity_usd: string | null;
  volume_24h: string | null;
  buy_count_24h: number | null;
  sell_count_24h: number | null;
  price_confidence: string | null;
  last_trade_at: string | null;
  first_seen: string | null;
}

export interface TokenReport {
  holders: { count: number; top1_pct: number; top10_pct: number } | null;
  hoodscore: { grade: string; score: number; reasons: string[] } | null;
  note?: string;
}

export interface WalletSummary {
  has_trades: boolean;
  total_pnl: string | null;
  realized_pnl: string | null;
  unrealized_pnl: string | null;
  total_volume: string | null;
  win_rate: string | null;
  roi: string | null;
  total_trades: number | null;
  tokens_traded: number | null;
  open_positions: number | null;
  closed_positions: number | null;
  pnl_confidence: string | null;
}

export interface TokenRow {
  address: string;
  symbol: string | null;
  price: string | null;
  volume_24h: string | null;
  liquidity_usd: string | null;
  fdv: string | null;
  first_seen: string | null;
  last_trade_at: string | null;
}

export type TrendingSort = "volume" | "liquidity" | "fdv" | "recent" | "new";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function toNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** $1.2B / $508K / $12.40 */
export function usdCompact(v: string | number | null | undefined): string {
  const n = toNum(v);
  if (n === null) return "—";
  if (n === 0) return "$0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

/** Like usdCompact but with an explicit + on gains, for P&L figures. */
export function signedUsd(v: string | number | null | undefined): string {
  const n = toNum(v);
  if (n === null) return "—";
  return n > 0 ? `+${usdCompact(n)}` : usdCompact(n);
}

/** A token price keeping ~4 significant figures for sub-cent values: $0.0₅5087 */
export function priceUsd(v: string | number | null | undefined): string {
  const n = toNum(v);
  if (n === null) return "—";
  if (n === 0) return "$0";
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  if (n >= 0.001) return `$${n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`;
  const m = n.toFixed(20).match(/^0\.(0+)(\d{1,4})/);
  if (!m) return `$${n.toExponential(3)}`;
  const sub = String(m[1].length).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)]);
  // m[2] starts with a non-zero digit (the zeros were consumed above), so
  // stripping trailing zeros can't empty it: 0.0000051 -> "51", not "5100"
  return `$0.0${sub}${m[2].replace(/0+$/, "")}`;
}

/** 15h / 4d / 2mo — coarse "time since". */
export function since(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const s = Math.max(0, (now - then) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d`;
  if (s < 31536000) return `${Math.floor(s / 2592000)}mo`;
  return `${Math.floor(s / 31536000)}y`;
}

const ADDRESS_RE = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/;

/** The first 0x… address in the text, lower-cased, or null. */
export function extractAddress(text: string): string | null {
  const m = text.match(ADDRESS_RE);
  return m ? m[0].toLowerCase() : null;
}

/** True when the whole message is just one address (pasted bare). */
export function isBareAddress(text: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(text.trim());
}

export interface ParsedCommand {
  cmd: string;
  args: string;
}

/**
 * "/scan@HoodMapBot 0xabc" -> { cmd: "scan", args: "0xabc" }. A command
 * addressed to a *different* bot (in a group with several) returns null.
 */
export function parseCommand(text: string, botUsername?: string): ParsedCommand | null {
  const m = text.trim().match(/^\/([A-Za-z0-9_]+)(?:@([A-Za-z0-9_]+))?(?:\s+([\s\S]*))?$/);
  if (!m) return null;
  if (m[2] && botUsername && m[2].toLowerCase() !== botUsername.toLowerCase()) return null;
  return { cmd: m[1].toLowerCase(), args: (m[3] ?? "").trim() };
}

const SORT_ALIASES: Record<string, TrendingSort> = {
  volume: "volume",
  vol: "volume",
  liquidity: "liquidity",
  liq: "liquidity",
  fdv: "fdv",
  recent: "recent",
  traded: "recent",
  new: "new",
  newest: "new",
};

export function parseSort(arg: string): TrendingSort {
  return SORT_ALIASES[arg.trim().toLowerCase()] ?? "volume";
}

const GRADE_DOT: Record<string, string> = { A: "🟢", B: "🟢", C: "🟡", D: "🟠", F: "🔴" };

function link(url: string, label: string): string {
  return `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
}

export function helpText(): string {
  return [
    "<b>HoodMap</b> — the intelligence layer for Robinhood Chain.",
    "",
    "/scan <code>&lt;token&gt;</code> — holders, HoodScore and market stats",
    "/wallet <code>&lt;address&gt;</code> — a wallet's win rate and P&amp;L",
    "/trending — top memecoins right now",
    "",
    "Or just paste any 0x… address in a private chat.",
    "",
    "<i>Independent analytics, not affiliated with Robinhood Markets, Inc. Not financial advice.</i>",
  ].join("\n");
}

export function formatToken(
  t: TokenDetail,
  r: TokenReport | null,
  siteUrl: string,
  now = Date.now()
): string {
  const sym = (t.symbol || "?").toUpperCase();
  const lines: string[] = [];
  lines.push(`<b>${escapeHtml(sym)}</b>${t.name && t.name !== t.symbol ? ` · ${escapeHtml(t.name)}` : ""}`);
  lines.push(`<code>${escapeHtml(t.address)}</code>`);
  lines.push("");

  if (t.price === null) {
    lines.push("No price yet — no trades or pool state indexed for this token.");
  } else {
    lines.push(`Price  ${priceUsd(t.price)}`);
    lines.push(`Mkt cap  ${usdCompact(t.market_cap)} · FDV  ${usdCompact(t.fdv)}`);
    lines.push(`Liquidity  ${usdCompact(t.liquidity_usd)} · Vol 24h  ${usdCompact(t.volume_24h)}`);
    lines.push(`24h trades  ${t.buy_count_24h ?? 0} buys / ${t.sell_count_24h ?? 0} sells`);
  }
  lines.push(
    `Age  ${since(t.first_seen, now)}` +
      (t.last_trade_at ? ` · last trade ${since(t.last_trade_at, now)} ago` : "")
  );
  lines.push("");

  if (r?.hoodscore) {
    const h = r.hoodscore;
    lines.push(`${GRADE_DOT[h.grade] ?? "⚪"} <b>HoodScore ${escapeHtml(h.grade)}</b> (${h.score}/100)`);
    for (const reason of h.reasons.slice(0, 5)) lines.push(`• ${escapeHtml(reason)}`);
  } else {
    lines.push(`<b>HoodScore</b>  ${escapeHtml(r?.note ?? "Not enough data to grade this token yet.")}`);
  }
  if (r?.holders) {
    lines.push("");
    lines.push(
      `Holders  ${r.holders.count} · top wallet ${r.holders.top1_pct.toFixed(1)}% · top 10 ${r.holders.top10_pct.toFixed(1)}%`
    );
  }

  const addr = encodeURIComponent(t.address);
  lines.push("");
  lines.push(`${link(`${siteUrl}/scan/${addr}`, "Full scan")} · ${link(`${siteUrl}/map/${addr}`, "HoodMap view")}`);
  return lines.join("\n");
}

export function walletTier(w: WalletSummary): string {
  if (!w.has_trades || !w.total_trades) return "NEW WALLET";
  const pnl = toNum(w.total_pnl) ?? 0;
  const roi = toNum(w.roi) ?? 0;
  if (pnl > 0 && (pnl >= 5000 || roi >= 1)) return "UP BIG";
  if (pnl > 0) return "PROFITABLE";
  const winRate = toNum(w.win_rate);
  if (pnl === 0 || (winRate !== null && winRate >= 0.45 && winRate <= 0.55)) return "MIXED BAG";
  return "DOWN BAD";
}

export function formatWallet(address: string, w: WalletSummary, siteUrl: string): string {
  const lines: string[] = [];
  lines.push("<b>Wallet Passport</b>");
  lines.push(`<code>${escapeHtml(address)}</code>`);
  lines.push("");

  if (!w.has_trades) {
    lines.push(
      "No DEX trades indexed for this wallet yet. It may be new, or HoodMap may still be catching up on very recent activity."
    );
  } else {
    const winRate = toNum(w.win_rate);
    const roi = toNum(w.roi);
    lines.push(`<b>${signedUsd(w.total_pnl)}</b> total P&amp;L · ${walletTier(w)}`);
    lines.push(`Realized  ${signedUsd(w.realized_pnl)} · Unrealized  ${signedUsd(w.unrealized_pnl)}`);
    lines.push(
      `Win rate  ${winRate === null ? "—" : `${Math.round(winRate * 100)}%`} · ${w.total_trades ?? 0} trades · ${w.tokens_traded ?? 0} tokens`
    );
    lines.push(
      `ROI  ${roi === null ? "—" : `${roi > 0 ? "+" : ""}${Math.round(roi * 100)}%`} · Volume  ${usdCompact(w.total_volume)}`
    );
    lines.push(`Positions  ${w.open_positions ?? 0} open / ${w.closed_positions ?? 0} closed`);
    lines.push(`Confidence  ${(w.pnl_confidence ?? "low").toUpperCase()}`);
  }

  lines.push("");
  lines.push(link(`${siteUrl}/wallet/${encodeURIComponent(address)}`, "Full passport"));
  return lines.join("\n");
}

const SORT_TITLE: Record<TrendingSort, string> = {
  volume: "by 24h volume",
  liquidity: "by liquidity",
  fdv: "by FDV",
  recent: "recently traded",
  new: "newly created",
};

export function formatTrending(rows: TokenRow[], sort: TrendingSort, siteUrl: string, now = Date.now()): string {
  if (rows.length === 0) return "No tokens to show yet.";
  const lines = [`<b>Top memecoins</b> · ${SORT_TITLE[sort]}`, ""];
  rows.forEach((t, i) => {
    const sym = (t.symbol || "?").toUpperCase();
    const name = link(`${siteUrl}/scan/${encodeURIComponent(t.address)}`, sym);
    const tail =
      sort === "new"
        ? `${since(t.first_seen, now)} old · liq ${usdCompact(t.liquidity_usd)}`
        : sort === "recent"
          ? `${since(t.last_trade_at, now)} ago · vol ${usdCompact(t.volume_24h)}`
          : `vol ${usdCompact(t.volume_24h)} · liq ${usdCompact(t.liquidity_usd)}`;
    lines.push(`${i + 1}. ${name}  ${priceUsd(t.price)} · ${tail}`);
  });
  lines.push("");
  lines.push(`<i>Tap a ticker for the full scan. Try /trending new · liquidity · recent</i>`);
  return lines.join("\n");
}
