"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { SiteNav } from "@/components/site/site-nav";
import { Footerdemo } from "@/components/ui/footer-section";
import { ScanInput } from "@/components/site/scan-input";
import { CopyButton } from "@/components/ui/copy-button";
import { DexChart } from "@/components/scan/dex-chart";
import { MarketStats } from "@/components/scan/market-stats";
import { HoodScoreCard } from "@/components/scan/hoodscore-card";
import { TxFeed } from "@/components/scan/tx-feed";
import {
  fetchToken,
  fetchTokenReport,
  fetchTokenSwaps,
  type TokenDetail,
  type TokenReport,
  type TokenSwap,
} from "@/lib/api";
import { monogramColor, shortAddr, since } from "@/lib/format";

const ADDR = /^0x[0-9a-fA-F]{40}$/;

type State = "loading" | "ready" | "notfound" | "invalid" | "error";

function SummaryPanel({ report }: { report: TokenReport | null }) {
  const top = report?.holders?.top ?? [];
  if (!top.length) {
    return (
      <p className="py-12 text-center text-[13px] text-ink-muted">
        {report?.note ?? "No holder transfers indexed for this token yet."}
      </p>
    );
  }
  return (
    <div>
      <p className="px-1 pb-2 font-mono text-[10px] uppercase tracking-widest text-ink-faint">
        Top holders · indexed transfer window
      </p>
      <div className="divide-y divide-line">
        {top.map((h, i) => (
          <div key={h.address} className="flex items-center gap-2.5 py-2.5 text-[12px]">
            <span className="w-4 text-center font-mono text-ink-faint">{i + 1}</span>
            <span className="font-mono text-ink-muted">{shortAddr(h.address)}</span>
            <CopyButton value={h.address} label="address" />
            {h.is_pool && (
              <span className="rounded bg-surface-3 px-1 py-px font-mono text-[9px] uppercase text-lime">
                pool
              </span>
            )}
            {h.is_burn && (
              <span className="rounded bg-surface-3 px-1 py-px font-mono text-[9px] uppercase text-ink-faint">
                burn
              </span>
            )}
            <span className="tabular ml-auto font-mono text-ink">{h.pct.toFixed(2)}%</span>
          </div>
        ))}
      </div>
      {report?.note && <p className="mt-3 px-1 text-[11px] text-ink-faint">{report.note}</p>}
    </div>
  );
}

export default function TokenScanPage() {
  const params = useParams<{ address: string }>();
  const address = (params.address || "").toLowerCase();

  const [t, setT] = useState<TokenDetail | null>(null);
  const [swaps, setSwaps] = useState<TokenSwap[]>([]);
  const [report, setReport] = useState<TokenReport | null>(null);
  const [state, setState] = useState<State>("loading");
  const [swapsLoading, setSwapsLoading] = useState(true);
  const [tab, setTab] = useState<"transactions" | "summary">("transactions");

  useEffect(() => {
    if (!address) return;
    if (!ADDR.test(address)) {
      setState("invalid");
      return;
    }
    const ac = new AbortController();
    setState("loading");
    setSwapsLoading(true);

    fetchToken(address, ac.signal)
      .then((d) => {
        setT(d);
        setState("ready");
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setState(e instanceof Error && e.message.includes("-> 404") ? "notfound" : "error");
      });

    fetchTokenSwaps(address, 40, ac.signal)
      .then((d) => setSwaps(d.swaps))
      .catch(() => {})
      .finally(() => setSwapsLoading(false));

    fetchTokenReport(address, ac.signal)
      .then(setReport)
      .catch(() => {});

    return () => ac.abort();
  }, [address]);

  const sym = (t?.symbol || "?").toUpperCase();

  return (
    <main className="relative min-h-[100svh] bg-canvas">
      <SiteNav />

      <div className="mx-auto max-w-6xl px-4 pb-24 pt-28 sm:px-6 sm:pt-32">
        <ScanInput className="max-w-2xl" />

        {state === "invalid" && (
          <p className="mt-8 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 font-mono text-[13px] text-danger">
            That doesn&apos;t look like a contract address.
          </p>
        )}

        {state === "notfound" && (
          <div className="mt-8 rounded-2xl border border-line bg-surface/40 px-5 py-10 text-center">
            <p className="font-mono text-[14px] text-ink">Not an ERC-20 on Robinhood Chain</p>
            <p className="mt-2 font-mono text-[12px] text-ink-faint">{shortAddr(address)}</p>
          </div>
        )}

        {state === "error" && (
          <p className="mt-8 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 font-mono text-[13px] text-danger">
            Couldn&apos;t reach the analytics API. Start it and refresh.
          </p>
        )}

        {(state === "loading" || state === "ready") && (
          <>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <span
                className="grid size-11 shrink-0 place-items-center rounded-full text-[15px] font-bold text-white"
                style={{ backgroundColor: monogramColor(sym) }}
              >
                {state === "loading" ? "" : sym.slice(0, 1)}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="font-display text-2xl font-bold uppercase text-ink sm:text-3xl">
                    {state === "loading" ? "Loading…" : sym}
                  </h1>
                  {t?.name && (
                    <span className="truncate font-mono text-[13px] text-ink-faint">({t.name})</span>
                  )}
                  {t?.verified && <ShieldCheck className="size-4 shrink-0 text-lime" />}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px] text-ink-faint">
                  <span>{shortAddr(address)}</span>
                  <CopyButton value={address} label="contract address" />
                  {t?.first_seen && <span>· seen {since(t.first_seen)}</span>}
                  {t?.token_type && t.token_type !== "unknown" && (
                    <span className="rounded bg-surface-3 px-1 py-px uppercase">
                      {t.token_type.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
              </div>
              <a
                href={`https://dexscreener.com/robinhood/${address}`}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-line-strong px-3.5 py-2 font-mono text-[12px] text-ink-muted transition-colors hover:text-ink"
              >
                DexScreener
                <ArrowUpRight className="size-3.5" />
              </a>
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
              <div className="flex flex-col gap-5">
                <DexChart pools={report?.pools ?? []} />

                <div className="rounded-2xl border border-line bg-surface/40">
                  <div className="flex gap-1 border-b border-line px-3 pt-3">
                    {(["transactions", "summary"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setTab(k)}
                        className={cn(
                          "rounded-t-lg px-3 py-2 font-mono text-[12px] uppercase tracking-wide transition-colors",
                          tab === k
                            ? "border-b-2 border-lime text-ink"
                            : "text-ink-faint hover:text-ink-muted"
                        )}
                      >
                        {k === "transactions" ? "Transactions" : "Summary"}
                      </button>
                    ))}
                  </div>
                  <div className="p-3">
                    {tab === "transactions" ? (
                      <TxFeed swaps={swaps} decimals={t?.decimals ?? null} loading={swapsLoading} />
                    ) : (
                      <SummaryPanel report={report} />
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-5">
                {t ? (
                  <MarketStats t={t} />
                ) : (
                  <div className="h-64 animate-pulse rounded-2xl border border-line bg-surface/40" />
                )}
                <HoodScoreCard report={report} />
              </div>
            </div>
          </>
        )}
      </div>

      <Footerdemo />
    </main>
  );
}
