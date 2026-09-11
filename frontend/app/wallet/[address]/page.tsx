"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SiteNav } from "@/components/site/site-nav";
import { ScanInput } from "@/components/site/scan-input";
import { CopyButton } from "@/components/ui/copy-button";
import { Modal } from "@/components/ui/modal";
import { WalletSummaryCard } from "@/components/wallet/wallet-summary";
import { WinRateCard } from "@/components/wallet/win-rate-card";
import { PositionsTable } from "@/components/wallet/positions-table";
import { TradesTable } from "@/components/wallet/trades-table";
import { TransactionsTable } from "@/components/wallet/transactions-table";
import { EXPLORER_ADDR } from "@/components/wallet/table-shared";
import {
  fetchWallet,
  fetchWalletPositions,
  fetchWalletTrades,
  fetchWalletTransactions,
  type WalletPosition,
  type WalletSummary,
  type WalletTrade,
  type WalletTransaction,
} from "@/lib/api";
import { monogramColor, shortAddr, since } from "@/lib/format";

const ADDR = /^0x[0-9a-fA-F]{40}$/;

type State = "loading" | "ready" | "invalid" | "error";
type Tab = "positions" | "trades" | "transactions";

export default function WalletPassportPage() {
  const params = useParams<{ address: string }>();
  const address = (params.address || "").toLowerCase();

  const [w, setW] = useState<WalletSummary | null>(null);
  const [positions, setPositions] = useState<WalletPosition[]>([]);
  const [trades, setTrades] = useState<WalletTrade[]>([]);
  const [txs, setTxs] = useState<WalletTransaction[]>([]);
  const [state, setState] = useState<State>("loading");
  const [rowsLoading, setRowsLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("positions");
  const [expandModal, setExpandModal] = useState(false);

  useEffect(() => {
    if (!address) return;
    if (!ADDR.test(address)) {
      setState("invalid");
      return;
    }
    const ac = new AbortController();
    setState("loading");
    setRowsLoading(true);

    fetchWallet(address, false, ac.signal)
      .then((d) => {
        setW(d);
        setState("ready");
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setState("error");
      });

    Promise.all([
      fetchWalletPositions(address, ac.signal).then((d) => setPositions(d.positions)),
      fetchWalletTrades(address, 60, ac.signal).then((d) => setTrades(d.trades)),
      fetchWalletTransactions(address, 60, ac.signal).then((d) => setTxs(d.transactions)),
    ])
      .catch(() => {})
      .finally(() => setRowsLoading(false));

    return () => ac.abort();
  }, [address]);

  const rowCount = tab === "positions" ? positions.length : tab === "trades" ? trades.length : txs.length;

  return (
    // desktop: locked to the viewport, exactly like the scan page — only the
    // right column scrolls its cards.
    <main className="relative min-h-[100svh] bg-canvas lg:h-screen lg:overflow-hidden">
      <SiteNav />

      <div className="w-full px-1 pb-8 pt-[76px] sm:px-1.5 sm:pt-20 lg:flex lg:h-full lg:flex-col lg:overflow-hidden lg:pb-1.5 lg:pt-[88px]">
        <div className="lg:shrink-0">
          <ScanInput
            className="max-w-none"
            hideHint
            basePath="/wallet"
            placeholder="Paste a wallet address (0x…)"
          />
        </div>

        {state === "invalid" && (
          <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[13px] text-danger">
            That doesn&apos;t look like a wallet address.
          </p>
        )}

        {state === "error" && (
          <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[13px] text-danger">
            Couldn&apos;t reach the analytics API. Start it and refresh.
          </p>
        )}

        {(state === "loading" || state === "ready") && (
          <div className="mt-2 flex flex-col gap-2 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
            <div className="grid gap-2 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_340px] lg:overflow-hidden xl:grid-cols-[minmax(0,1fr)_380px]">
              {/* left — positions / trades / transactions; never its own scrollbar */}
              <div className="order-2 flex min-w-0 flex-col gap-2 lg:order-1 lg:min-h-0">
                <div className="rounded-md border border-line bg-surface/40 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
                  <div className="flex items-center gap-1 border-b border-line px-2 pt-1.5 lg:shrink-0">
                    {([
                      ["positions", "Positions"],
                      ["trades", "Trades"],
                      ["transactions", "Transactions"],
                    ] as const).map(([k, label]) => (
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
                        {label}
                      </button>
                    ))}
                    {rowCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpandModal(true)}
                        aria-label="Expand full list"
                        className="ml-auto mb-1 rounded p-1 text-ink-faint transition-colors hover:text-ink"
                      >
                        <Maximize2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="p-2 lg:min-h-0 lg:flex-1 lg:overflow-auto">
                    {tab === "positions" && (
                      <PositionsTable positions={positions} loading={rowsLoading} />
                    )}
                    {tab === "trades" && <TradesTable trades={trades} loading={rowsLoading} />}
                    {tab === "transactions" && (
                      <TransactionsTable wallet={address} transactions={txs} loading={rowsLoading} />
                    )}
                  </div>
                </div>
              </div>

              {/* right — wallet identity (pinned) + the one scroll region */}
              <div className="order-1 flex flex-col gap-1.5 lg:order-2 lg:h-full lg:min-h-0">
                <div className="flex items-start gap-2 px-1 lg:shrink-0">
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-md text-[14px] font-bold text-white"
                    style={{ backgroundColor: monogramColor(address) }}
                  >
                    {address.slice(2, 3).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h1 className="truncate font-display text-lg font-bold text-ink">
                      Wallet Passport
                    </h1>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-ink-faint">
                      <span>{shortAddr(address)}</span>
                      <CopyButton value={address} label="wallet address" />
                      {w?.first_trade_at && <span>· first trade {since(w.first_trade_at)}</span>}
                      <a
                        href={EXPLORER_ADDR + address}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-ink-muted transition-colors hover:text-ink"
                      >
                        Explorer
                      </a>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                  {w ? (
                    <>
                      <WalletSummaryCard w={w} />
                      <WinRateCard w={w} />
                    </>
                  ) : (
                    <div className="h-56 animate-pulse rounded-md border border-line bg-surface/40" />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {expandModal && (
        <Modal
          title={tab === "positions" ? "Positions" : tab === "trades" ? "Trades" : "Transactions"}
          onClose={() => setExpandModal(false)}
        >
          {tab === "positions" && (
            <PositionsTable positions={positions} loading={rowsLoading} expanded />
          )}
          {tab === "trades" && <TradesTable trades={trades} loading={rowsLoading} expanded />}
          {tab === "transactions" && (
            <TransactionsTable wallet={address} transactions={txs} loading={rowsLoading} expanded />
          )}
        </Modal>
      )}
    </main>
  );
}
