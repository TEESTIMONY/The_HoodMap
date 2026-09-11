import { ArrowDownRight, ArrowUpRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WalletTrade } from "@/lib/api";
import { priceUsd, since, tokenAmount, usdCompact } from "@/lib/format";
import { TokenIcon } from "@/components/ui/token-icon";
import { DIVIDER, EXPLORER_TX } from "./table-shared";

const SIDE_BADGE: Record<WalletTrade["side"], string> = {
  buy: "text-success bg-success/10",
  sell: "text-danger bg-danger/10",
};
const SIDE_ICON = { buy: ArrowUpRight, sell: ArrowDownRight } as const;

function pnlColor(v: string | null): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return "text-ink-muted";
  return n > 0 ? "text-success" : "text-danger";
}

function signedUsd(v: string | null): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const s = usdCompact(Math.abs(n));
  return n > 0 ? `+${s}` : n < 0 ? `-${s}` : s;
}

export function TradesTable({
  trades,
  loading,
  expanded = false,
}: {
  trades: WalletTrade[];
  loading: boolean;
  expanded?: boolean;
}) {
  if (!loading && trades.length === 0) {
    return (
      <p className="px-1 py-12 text-center text-[13px] text-ink-faint">
        No reconstructed trades for this wallet yet.
      </p>
    );
  }

  const table = (
    <table className="w-full min-w-[720px] border-collapse text-sm">
      <thead>
        <tr className="sticky top-0 z-10 border-b border-line-strong text-left text-[11px] uppercase tracking-wide text-ink-faint">
          <th className="bg-surface px-2 py-1.5 font-medium">Age</th>
          <th className={cn("bg-surface px-2 py-1.5 text-left font-medium", DIVIDER)}>Token</th>
          {["Type", "Amount", "Price", "USD", "Realized"].map((h) => (
            <th key={h} className={cn("bg-surface px-2 py-1.5 text-right font-medium", DIVIDER)}>
              {h}
            </th>
          ))}
          <th className={cn("bg-surface px-4 py-1.5 text-right font-medium", DIVIDER)}>Txn</th>
        </tr>
      </thead>
      <tbody>
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="divide-x divide-line-strong border-b border-line-strong">
                {Array.from({ length: 7 }).map((__, j) => (
                  <td key={j} className={cn("px-2 py-2", j === 6 && "px-4")}>
                    <span
                      className={cn(
                        "block h-3 animate-pulse rounded bg-surface-3",
                        j === 0 ? "w-12" : "ml-auto w-14"
                      )}
                    />
                  </td>
                ))}
              </tr>
            ))
          : trades.map((t, i) => {
              const Icon = SIDE_ICON[t.side];
              return (
                <tr
                  key={`${t.tx_hash}-${t.token_address}-${i}`}
                  className="divide-x divide-line-strong border-b border-line-strong transition last:border-b-0 hover:bg-white/[0.02]"
                >
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[12px] text-ink-faint">
                    {since(t.timestamp)} ago
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[12px] font-semibold text-ink">
                    <span className="inline-flex items-center gap-1.5">
                      <TokenIcon
                        address={t.token_address}
                        symbol={t.symbol}
                        className="size-4"
                        textClassName="text-[8px]"
                      />
                      {t.symbol ?? "?"}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                        SIDE_BADGE[t.side]
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {t.side}
                    </span>
                  </td>
                  <td className="tabular px-2 py-1.5 text-right font-mono text-[12px] text-ink">
                    {tokenAmount(t.quantity, t.decimals)}
                  </td>
                  <td className="tabular px-2 py-1.5 text-right font-mono text-[12px] text-ink-muted">
                    {priceUsd(t.price)}
                  </td>
                  <td className="tabular px-2 py-1.5 text-right font-mono text-[12px] text-ink-muted">
                    {usdCompact(t.usd_value)}
                  </td>
                  <td className={cn("tabular px-2 py-1.5 text-right font-mono text-[12px]", pnlColor(t.realized_pnl))}>
                    {t.side === "sell" ? signedUsd(t.realized_pnl) : "—"}
                  </td>
                  <td className="px-4 py-1.5 text-right">
                    <a
                      href={EXPLORER_TX + t.tx_hash}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="View transaction on the block explorer"
                      className="inline-flex text-ink-faint transition hover:text-lime-soft"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </td>
                </tr>
              );
            })}
      </tbody>
    </table>
  );

  if (expanded) return <div className="overflow-x-auto">{table}</div>;

  return (
    <div className="max-h-[300px] overflow-auto lg:max-h-none lg:overflow-visible">{table}</div>
  );
}
