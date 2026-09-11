import { cn } from "@/lib/utils";
import type { WalletPosition } from "@/lib/api";
import { priceUsd, since, tokenAmount, usdCompact } from "@/lib/format";
import { DIVIDER } from "./table-shared";

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

const HEAD = ["Qty", "Avg cost", "Price", "Value", "Realized", "Unrealized", "Status"];

export function PositionsTable({
  positions,
  loading,
  expanded = false,
}: {
  positions: WalletPosition[];
  loading: boolean;
  expanded?: boolean;
}) {
  if (!loading && positions.length === 0) {
    return (
      <p className="px-1 py-12 text-center text-[13px] text-ink-faint">
        No positions reconstructed for this wallet yet.
      </p>
    );
  }

  const table = (
    <table className="w-full min-w-[720px] border-collapse text-sm">
      <thead>
        <tr className="sticky top-0 z-10 border-b border-line-strong text-left text-[11px] uppercase tracking-wide text-ink-faint">
          <th className="bg-surface px-2 py-1.5 font-medium">Token</th>
          {HEAD.map((h) => (
            <th key={h} className={cn("bg-surface px-2 py-1.5 text-right font-medium", DIVIDER)}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="divide-x divide-line-strong border-b border-line-strong">
                {Array.from({ length: 8 }).map((__, j) => (
                  <td key={j} className="px-2 py-2">
                    <span
                      className={cn(
                        "block h-3 animate-pulse rounded bg-surface-3",
                        j === 0 ? "w-16" : "ml-auto w-14"
                      )}
                    />
                  </td>
                ))}
              </tr>
            ))
          : positions.map((p) => (
              <tr
                key={p.token_address}
                className="divide-x divide-line-strong border-b border-line-strong transition last:border-b-0 hover:bg-white/[0.02]"
              >
                <td className="px-2 py-1.5 font-mono text-[12px] text-ink">
                  <span className="font-semibold">{p.symbol ?? "?"}</span>
                  {p.last_activity_at && (
                    <span className="ml-1.5 text-ink-faint">· {since(p.last_activity_at)}</span>
                  )}
                </td>
                <td className="tabular px-2 py-1.5 text-right font-mono text-[12px] text-ink-muted">
                  {tokenAmount(p.quantity, p.decimals)}
                </td>
                <td className="tabular px-2 py-1.5 text-right font-mono text-[12px] text-ink-muted">
                  {priceUsd(p.average_cost)}
                </td>
                <td className="tabular px-2 py-1.5 text-right font-mono text-[12px] text-ink-muted">
                  {priceUsd(p.current_price ?? p.market_price)}
                </td>
                <td className="tabular px-2 py-1.5 text-right font-mono text-[12px] text-ink">
                  {usdCompact(p.current_value)}
                </td>
                <td className={cn("tabular px-2 py-1.5 text-right font-mono text-[12px]", pnlColor(p.realized_pnl))}>
                  {signedUsd(p.realized_pnl)}
                </td>
                <td
                  className={cn(
                    "tabular px-2 py-1.5 text-right font-mono text-[12px]",
                    pnlColor(p.unrealized_pnl)
                  )}
                >
                  {signedUsd(p.unrealized_pnl)}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                      p.is_open ? "bg-lime/10 text-lime" : "bg-white/[0.05] text-ink-faint"
                    )}
                  >
                    {p.is_open ? "open" : "closed"}
                  </span>
                </td>
              </tr>
            ))}
      </tbody>
    </table>
  );

  if (expanded) return <div className="overflow-x-auto">{table}</div>;

  return (
    <div className="max-h-[300px] overflow-auto lg:max-h-none lg:overflow-visible">{table}</div>
  );
}
