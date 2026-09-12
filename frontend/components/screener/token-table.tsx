"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TokenRow } from "@/lib/api";
import { count, priceUsd, shortAddr, since, usdCompact } from "@/lib/format";
import { CopyButton } from "@/components/ui/copy-button";
import { TokenIcon } from "@/components/ui/token-icon";

const COLS =
  "grid-cols-[44px_minmax(180px,2fr)_repeat(6,minmax(96px,1fr))_minmax(108px,1fr)]";

function Head({ children, align = "right" }: { children: React.ReactNode; align?: "left" | "right" | "center" }) {
  return (
    <div
      className={cn(
        "px-3 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-faint",
        align === "left" && "text-left",
        align === "right" && "text-right",
        align === "center" && "text-center"
      )}
    >
      {children}
    </div>
  );
}

function Cell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("tabular px-3 py-3.5 text-right font-mono text-[13px] text-ink", className)}>{children}</div>;
}

function ConfidencePill({ c }: { c: "high" | "medium" | "low" }) {
  const map = {
    high: "border-success/40 bg-success/10 text-success",
    medium: "border-warning/40 bg-warning/10 text-warning",
    low: "border-danger/40 bg-danger/10 text-danger",
  } as const;
  return (
    <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase", map[c])}>
      {c}
    </span>
  );
}

function Row({ rank, r }: { rank: number; r: TokenRow }) {
  const sym = (r.symbol || "?").toUpperCase();
  const txns = (r.buy_count_24h ?? 0) + (r.sell_count_24h ?? 0);
  return (
    <Link
      href={`/scan/${r.address}`}
      className={cn(
        "grid items-center border-b border-line text-ink transition-colors last:border-0 hover:bg-surface-2/60",
        COLS
      )}
    >
      <div className="px-3 py-3.5 text-center font-mono text-[12px] text-ink-faint">{rank}</div>

      <div className="flex min-w-0 items-center gap-2.5 px-3 py-3.5">
        <TokenIcon address={r.address} symbol={sym} className="size-7" />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-mono text-[13px] font-semibold">{sym}</span>
            <span className="shrink-0 rounded bg-surface-3 px-1 py-px font-mono text-[9px] uppercase tracking-wide text-ink-faint">
              RH
            </span>
            {r.verified && <ShieldCheck className="size-3 shrink-0 text-lime" />}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-ink-faint">
            <span className="truncate">{r.name || shortAddr(r.address)}</span>
            <CopyButton value={r.address} label="contract address" />
          </span>
        </span>
      </div>

      <Cell>{priceUsd(r.price)}</Cell>
      <Cell className="text-ink-muted">{since(r.first_seen)}</Cell>
      <Cell>{usdCompact(r.fdv ?? r.market_cap)}</Cell>
      <Cell>{usdCompact(r.liquidity_usd)}</Cell>
      <Cell>{usdCompact(r.volume_24h)}</Cell>
      <Cell className="text-ink-muted">{count(txns)}</Cell>
      <div className="px-3 py-3.5 text-right">
        <ConfidencePill c={r.price_confidence ?? "low"} />
      </div>
    </Link>
  );
}

function SkeletonRow() {
  return (
    <div className={cn("grid items-center border-b border-line", COLS)}>
      <div className="px-3 py-4" />
      <div className="flex items-center gap-2.5 px-3 py-4">
        <span className="size-7 shrink-0 animate-pulse rounded-full bg-surface-3" />
        <span className="h-3 w-24 animate-pulse rounded bg-surface-3" />
      </div>
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="px-3 py-4">
          <span className="ml-auto block h-3 w-14 animate-pulse rounded bg-surface-3" />
        </div>
      ))}
    </div>
  );
}

export function TokenTable({ rows, loading }: { rows: TokenRow[]; loading: boolean }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface/40">
      <div className="min-w-[960px]">
        <div className={cn("grid border-b border-line-strong bg-surface-2/40", COLS)}>
          <Head align="center">#</Head>
          <Head align="left">Token</Head>
          <Head>Price</Head>
          <Head>Age</Head>
          <Head>FDV</Head>
          <Head>Liquidity</Head>
          <Head>Vol 24h</Head>
          <Head>Txns 24h</Head>
          <Head>Confidence</Head>
        </div>

        {loading && rows.length === 0 ? (
          Array.from({ length: 12 }).map((_, i) => <SkeletonRow key={i} />)
        ) : rows.length === 0 ? (
          <div className="px-4 py-20 text-center text-[14px] text-ink-muted">
            No tokens returned yet. The statistics worker may not have run.
          </div>
        ) : (
          rows.map((r, i) => <Row key={r.address} rank={i + 1} r={r} />)
        )}
      </div>
    </div>
  );
}
