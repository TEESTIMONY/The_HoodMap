import type { TokenDetail } from "@/lib/api";
import { count, priceUsd, toNum, usdCompact } from "@/lib/format";

function nativePrice(v: string | null): string {
  const n = toNum(v);
  if (n === null || n === 0) return "—";
  if (n >= 0.001) return n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return n.toExponential(3);
}

export function MarketStats({ t }: { t: TokenDetail }) {
  const cells: { label: string; value: string; accent?: boolean }[] = [
    { label: "Price USD", value: priceUsd(t.price), accent: true },
    { label: "Price WETH", value: nativePrice(t.price_native) },
    { label: "Liquidity", value: usdCompact(t.liquidity_usd) },
    { label: "FDV", value: usdCompact(t.fdv) },
    { label: "Market cap", value: usdCompact(t.market_cap ?? t.fdv) },
    { label: "Vol 24h", value: usdCompact(t.volume_24h) },
    { label: "Vol 6h", value: usdCompact(t.volume_6h) },
    { label: "Vol 1h", value: usdCompact(t.volume_1h) },
    { label: "Buys 24h", value: count(t.buy_count_24h) },
    { label: "Sells 24h", value: count(t.sell_count_24h) },
    { label: "Pools", value: count(t.pool_count) },
    { label: "Confidence", value: (t.price_confidence ?? "low").toUpperCase() },
  ];

  return (
    <div className="rounded-2xl border border-line bg-surface/40 p-5">
      <p className="font-mono text-[12px] uppercase tracking-widest text-ink-faint">Market stats</p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {cells.map((c) => (
          <div key={c.label} className="rounded-lg border border-line bg-canvas px-2.5 py-2">
            <p
              className={
                "tabular truncate font-mono text-[13px] " + (c.accent ? "text-lime" : "text-ink")
              }
            >
              {c.value}
            </p>
            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-ink-faint">
              {c.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
