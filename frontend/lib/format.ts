export function toNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** $1.2B / $508K / $12.40 — compact USD for market-cap-ish figures. */
export function usdCompact(v: string | number | null | undefined): string {
  const n = toNum(v);
  if (n === null) return "—";
  if (n === 0) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  if (abs >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(2)}`;
}

/** A token price, keeping ~4 significant figures for sub-cent values. */
export function priceUsd(v: string | number | null | undefined): string {
  const n = toNum(v);
  if (n === null) return "—";
  if (n === 0) return "$0";
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  if (n >= 0.001) return `$${n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`;
  // very small: $0.0₅5087  (₅ = five leading zeros after the point)
  const s = n.toFixed(20);
  const m = s.match(/^0\.(0+)(\d{1,4})/);
  if (!m) return `$${n.toExponential(3)}`;
  const zeros = m[1].length;
  const sub = String(zeros).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)]);
  return `$0.0${sub}${m[2]}`;
}

/** 62,463,311 */
export function count(v: string | number | null | undefined): string {
  const n = toNum(v);
  if (n === null) return "—";
  return Math.round(n).toLocaleString("en-US");
}

/** 15h / 4d / 2mo — coarse "time since". */
export function since(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const s = Math.max(0, (Date.now() - then) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d`;
  if (s < 31536000) return `${Math.floor(s / 2592000)}mo`;
  return `${Math.floor(s / 31536000)}y`;
}

export function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** Deterministic accent for a token monogram. */
export function monogramColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `hsl(${h} 55% 45%)`;
}
