"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, Waypoints } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MapCluster, MapNode, WalletTokenActivity } from "@/lib/api";
import { fetchWalletTokenActivity } from "@/lib/api";
import { shortAddr, since, toNum, tokenAmount, usdCompact } from "@/lib/format";
import { CopyButton } from "@/components/ui/copy-button";
import { ROLE_COLOR, ROLE_LABEL } from "./colors";

const EXPLORER_TX = "https://explorer.mainnet.chain.robinhood.com/tx/";

export function WalletDetailPanel({
  tokenAddress,
  node,
  rank,
  cluster,
  decimals,
  price,
}: {
  tokenAddress: string;
  node: MapNode;
  rank: number;
  cluster: MapCluster | null;
  decimals: number | null;
  price: string | null;
}) {
  const [activity, setActivity] = useState<WalletTokenActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    setActivity(null);
    setLoading(true);
    setExpanded(false);
    fetchWalletTokenActivity(tokenAddress, node.address, ac.signal)
      .then(setActivity)
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [tokenAddress, node.address]);

  const usdValue = (() => {
    const p = toNum(price);
    const raw = toNum(node.balance);
    if (p === null || raw === null) return null;
    return (raw / 10 ** (decimals ?? 18)) * p;
  })();

  const roleColor = ROLE_COLOR[node.role];

  return (
    <div className="rounded-md border border-line bg-surface/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-md border font-mono text-[11px] font-bold"
            style={{ borderColor: `rgba(${roleColor},0.5)`, color: `rgb(${roleColor})`, backgroundColor: `rgba(${roleColor},0.12)` }}
          >
            #{rank}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-mono text-[13px] text-ink">
              {shortAddr(node.address)}
              <CopyButton value={node.address} label="address" />
              <Link
                href={`/wallet/${node.address}`}
                aria-label="Open Wallet Passport"
                className="text-ink-faint transition-colors hover:text-lime"
              >
                <Waypoints className="size-3.5" />
              </Link>
            </div>
            <span
              className="mt-0.5 inline-block rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide"
              style={{ color: `rgb(${roleColor})`, backgroundColor: `rgba(${roleColor},0.12)` }}
            >
              {ROLE_LABEL[node.role]}
            </span>
          </div>
        </div>

        {cluster && (
          <div className="text-right">
            <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">Cluster share</p>
            <p className="tabular font-mono text-[13px] text-ink">{cluster.totalPct.toFixed(2)}%</p>
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <Stat label="Of supply" value={`${node.pct.toFixed(3)}%`} accent />
        <Stat label="Amount held" value={tokenAmount(node.balance, decimals)} />
        <Stat label="USD value" value={usdValue !== null ? usdCompact(usdValue) : "—"} />
        <Stat label="Transfers" value={loading ? "…" : String(activity?.transferCount ?? 0)} />
      </div>

      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <Stat
          label="In"
          value={
            loading
              ? "…"
              : `${tokenAmount(activity?.inflow.total ?? "0", decimals)} · ${activity?.inflow.counterparties ?? 0} sender${activity?.inflow.counterparties === 1 ? "" : "s"}`
          }
          small
        />
        <Stat
          label="Out"
          value={
            loading
              ? "…"
              : `${tokenAmount(activity?.outflow.total ?? "0", decimals)} · ${activity?.outflow.counterparties ?? 0} recipient${activity?.outflow.counterparties === 1 ? "" : "s"}`
          }
          small
        />
      </div>

      {cluster && (
        <p className="mt-2.5 text-[12px] leading-snug text-ink-muted">
          Part of a {cluster.memberCount}-wallet cluster funded by{" "}
          <span className="font-mono text-ink">{shortAddr(cluster.funder)}</span>.
        </p>
      )}

      {!loading && activity && activity.recentTransfers.length > 0 && (
        <div className="mt-2.5 border-t border-line pt-2.5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-faint transition-colors hover:text-ink"
          >
            <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
            {expanded ? "Hide" : "Show"} recent transfers
          </button>
          {expanded && (
            <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
              {activity.recentTransfers.map((t) => (
                <li
                  key={t.hash + t.direction}
                  className="flex items-center justify-between gap-2 font-mono text-[11px]"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={cn(
                        "rounded px-1 py-px text-[9px] font-semibold uppercase",
                        t.direction === "in" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                      )}
                    >
                      {t.direction}
                    </span>
                    <span className="truncate text-ink-muted">{shortAddr(t.counterparty)}</span>
                  </span>
                  <span className="tabular shrink-0 text-ink">{tokenAmount(t.amount, decimals)}</span>
                  <span className="shrink-0 text-ink-faint">{since(t.timestamp)} ago</span>
                  <a
                    href={EXPLORER_TX + t.hash}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-ink-faint transition-colors hover:text-lime"
                    aria-label="View transaction"
                  >
                    <ExternalLink className="size-3" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent, small }: { label: string; value: string; accent?: boolean; small?: boolean }) {
  return (
    <div className="rounded border border-line bg-canvas px-2 py-1.5">
      <p
        className={cn(
          "tabular truncate font-mono",
          small ? "text-[11px]" : "text-[13px]",
          accent ? "text-lime" : "text-ink"
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-ink-faint">{label}</p>
    </div>
  );
}
