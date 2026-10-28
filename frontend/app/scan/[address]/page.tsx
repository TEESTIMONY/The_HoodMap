"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowUpRight, Maximize2, ShieldCheck, Waypoints } from "lucide-react";
import { cn } from "@/lib/utils";
import { SiteNav } from "@/components/site/site-nav";
import { ScanInput } from "@/components/site/scan-input";
import { CopyButton } from "@/components/ui/copy-button";
import { DexChart } from "@/components/scan/dex-chart";
import { MarketStats } from "@/components/scan/market-stats";
import { HoodScoreCard } from "@/components/scan/hoodscore-card";
import { TxFeed } from "@/components/scan/tx-feed";
import { Modal } from "@/components/ui/modal";
import { HoodMapView } from "@/components/map/hoodmap-view";
import {
  fetchToken,
  fetchTokenReport,
  fetchTokenSwaps,
  type TokenDetail,
  type TokenReport,
  type TokenSwap,
} from "@/lib/api";
import { shortAddr, since } from "@/lib/format";
import { TokenIcon } from "@/components/ui/token-icon";

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
          <div key={h.address} className="flex items-center gap-2.5 py-1.5 text-[12px]">
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
  const [tab, setTab] = useState<"transactions" | "summary" | "chart">("transactions");
  const [txModal, setTxModal] = useState(false);
  const [hoodMapOpen, setHoodMapOpen] = useState(false);

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
    // desktop: the whole page is locked to the viewport — nothing scrolls the
    // document, only the right column scrolls its cards.
    <main className="relative min-h-[100svh] bg-canvas lg:h-screen lg:overflow-hidden">
      <SiteNav />

      <div className="w-full px-1 pb-8 pt-[76px] sm:px-1.5 sm:pt-20 lg:flex lg:h-full lg:flex-col lg:overflow-hidden lg:pb-1.5 lg:pt-[88px]">
        <div className="lg:shrink-0">
          <ScanInput className="max-w-none" hideHint />
        </div>

        {state === "invalid" && (
          <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[13px] text-danger">
            That doesn&apos;t look like a contract address.
          </p>
        )}

        {state === "notfound" && (
          <div className="mt-3 rounded-md border border-line bg-surface/40 px-4 py-8 text-center">
            <p className="font-mono text-[14px] text-ink">Not an ERC-20 on Robinhood Chain</p>
            <p className="mt-2 font-mono text-[12px] text-ink-faint">{shortAddr(address)}</p>
          </div>
        )}

        {state === "error" && (
          <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[13px] text-danger">
            Couldn&apos;t reach the analytics API. Start it and refresh.
          </p>
        )}

        {(state === "loading" || state === "ready") && (
          <div className="mt-2 flex flex-col gap-2 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
            <div className="grid gap-2 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_340px] lg:overflow-hidden xl:grid-cols-[minmax(0,1fr)_380px]">
              {/* left — chart + tabs + table; never its own scrollbar */}
              <div className="order-2 flex min-w-0 flex-col gap-2 lg:order-1 lg:min-h-0">
                <div className="hidden lg:block lg:shrink-0">
                  <DexChart pools={report?.pools ?? []} />
                </div>

                <div className="rounded-md border border-line bg-surface/40 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
                  <div className="flex items-center gap-1 border-b border-line px-2 pt-1.5 lg:shrink-0">
                    <button
                      type="button"
                      onClick={() => setTab("chart")}
                      className={cn(
                        "rounded-t px-2.5 py-1.5 font-mono text-[12px] uppercase tracking-wide transition-colors lg:hidden",
                        tab === "chart"
                          ? "border-b-2 border-lime text-ink"
                          : "text-ink-faint hover:text-ink-muted"
                      )}
                    >
                      Chart
                    </button>
                    {(["transactions", "summary"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setTab(k)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-t px-2.5 py-1.5 font-mono text-[12px] uppercase tracking-wide transition-colors",
                          tab === k
                            ? "border-b-2 border-lime text-ink"
                            : "text-ink-faint hover:text-ink-muted"
                        )}
                      >
                        {k === "transactions" ? "Transactions" : "Summary"}
                        {k === "transactions" && swaps.length > 0 && (
                          <span className="rounded-full bg-surface-3 px-1.5 py-px text-[10px] text-ink-muted">
                            {swaps.length}
                          </span>
                        )}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setHoodMapOpen(true)}
                      className="flex shrink-0 items-center gap-1.5 rounded-t px-2.5 py-1.5 font-mono text-[12px] uppercase tracking-wide text-ink-faint transition-colors hover:text-ink"
                    >
                      <Waypoints className="size-3.5" />
                      HoodMap
                    </button>
                    {tab === "transactions" && swaps.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setTxModal(true)}
                        aria-label="Expand full transaction list"
                        className="ml-auto mb-1 rounded p-1 text-ink-faint transition-colors hover:text-ink"
                      >
                        <Maximize2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="p-2 lg:min-h-0 lg:flex-1 lg:overflow-auto">
                    {tab === "chart" && (
                      <div className="lg:hidden">
                        <DexChart pools={report?.pools ?? []} />
                      </div>
                    )}
                    {tab === "transactions" && (
                      <TxFeed swaps={swaps} decimals={t?.decimals ?? null} loading={swapsLoading} />
                    )}
                    {tab === "summary" && <SummaryPanel report={report} />}
                  </div>
                </div>
              </div>

              {/* right — token identity (pinned) + the one scroll region */}
              <div className="order-1 flex flex-col gap-1.5 lg:order-2 lg:h-full lg:min-h-0">
                <div className="flex items-start gap-2 px-1 lg:shrink-0">
                  <TokenIcon
                    address={address}
                    symbol={state === "loading" ? null : sym}
                    className="size-9 rounded-md"
                    textClassName="text-[14px]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {state === "loading" ? (
                        <span className="my-1 block h-5 w-24 animate-pulse rounded bg-surface-3" />
                      ) : (
                        <h1 className="truncate font-display text-lg font-bold uppercase text-ink">
                          {sym}
                        </h1>
                      )}
                      {t?.name && (
                        <span className="truncate font-mono text-[12px] text-ink-faint">
                          {t.name}
                        </span>
                      )}
                      {t?.verified && <ShieldCheck className="size-4 shrink-0 text-lime" />}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-ink-faint">
                      <span>{shortAddr(address)}</span>
                      <CopyButton value={address} label="contract address" />
                      {t?.first_seen && <span>· {since(t.first_seen)}</span>}
                      {t?.token_type && t.token_type !== "unknown" && (
                        <span className="rounded bg-surface-3 px-1 py-px uppercase">
                          {t.token_type.replace(/_/g, " ")}
                        </span>
                      )}
                      <a
                        href={`https://dexscreener.com/robinhood/${address}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-ink-muted transition-colors hover:text-ink"
                      >
                        DexScreener
                        <ArrowUpRight className="size-3" />
                      </a>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                  {t ? (
                    <MarketStats t={t} />
                  ) : (
                    <div className="h-56 animate-pulse rounded-md border border-line bg-surface/40" />
                  )}
                  <HoodScoreCard report={report} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {txModal && (
        <Modal title="Transactions" onClose={() => setTxModal(false)}>
          <TxFeed swaps={swaps} decimals={t?.decimals ?? null} loading={swapsLoading} expanded />
        </Modal>
      )}

      {hoodMapOpen && (
        <Modal title={`HoodMap — ${sym}`} onClose={() => setHoodMapOpen(false)} size="full">
          <HoodMapView tokenAddress={address} decimals={t?.decimals ?? null} price={t?.price ?? null} />
        </Modal>
      )}
    </main>
  );
}
