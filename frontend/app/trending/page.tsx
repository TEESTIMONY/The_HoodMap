"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SiteNav } from "@/components/site/site-nav";
import { Footerdemo } from "@/components/ui/footer-section";
import { TokenTable } from "@/components/screener/token-table";
import {
  fetchStats,
  fetchTokens,
  type MarketStats,
  type TokenRow,
  type TokenSort,
} from "@/lib/api";
import { count, priceUsd, usdCompact } from "@/lib/format";

const SORTS: { key: TokenSort; label: string }[] = [
  { key: "volume", label: "Volume" },
  { key: "liquidity", label: "Liquidity" },
  { key: "fdv", label: "FDV" },
  { key: "recent", label: "Recently traded" },
];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface/40 px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-ink-faint">{label}</p>
      <p className="tabular mt-1 font-mono text-lg text-ink">{value}</p>
    </div>
  );
}

export default function TrendingPage() {
  const [sort, setSort] = useState<TokenSort>("volume");
  const [rows, setRows] = useState<TokenRow[]>([]);
  const [stats, setStats] = useState<MarketStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetchStats(ac.signal)
      .then(setStats)
      .catch(() => {});
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setErr(null);
    fetchTokens(sort, 60, ac.signal)
      .then((d) => setRows(d.tokens))
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setErr("Couldn't reach the analytics API. Start it and refresh.");
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [sort]);

  return (
    <main className="relative min-h-[100svh] bg-canvas">
      <SiteNav />

      <div className="mx-auto max-w-6xl px-4 pb-24 pt-32 sm:px-6 sm:pt-40">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[2rem] font-bold uppercase leading-none text-ink sm:text-[2.75rem]">
            Top Memecoins
          </h1>
          <p className="max-w-xl text-[14px] leading-relaxed text-ink-muted">
            Every traded token on Robinhood Chain, ranked. Prices, liquidity and volume are derived
            from on-chain pools and swaps, not a listing.
          </p>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Tokens tracked" value={stats ? count(stats.tokens) : "…"} />
          <Stat label="Trading pairs" value={stats ? count(stats.pools) : "…"} />
          <Stat label="Total liquidity" value={stats ? usdCompact(stats.liquidity_usd) : "…"} />
          <Stat label="WETH price" value={stats?.weth_usd ? priceUsd(stats.weth_usd) : "…"} />
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-2">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              className={cn(
                "rounded-full border px-4 py-2 font-mono text-[12px] transition-colors",
                sort === s.key
                  ? "border-lime/50 bg-lime/10 text-lime"
                  : "border-line-strong text-ink-muted hover:text-ink"
              )}
            >
              {s.label}
            </button>
          ))}
          <span className="ml-auto font-mono text-[11px] text-ink-faint">
            {loading ? "Loading…" : `Ranked by ${SORTS.find((s) => s.key === sort)?.label.toLowerCase()}`}
          </span>
        </div>

        {err && (
          <p className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 font-mono text-[12px] text-danger">
            {err}
          </p>
        )}

        <div className="mt-4">
          <TokenTable rows={rows} loading={loading} />
        </div>
      </div>

      <Footerdemo />
    </main>
  );
}
