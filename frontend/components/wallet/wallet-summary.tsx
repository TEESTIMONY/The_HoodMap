import type { WalletSummary } from "@/lib/api";
import { count, toNum, usdCompact } from "@/lib/format";

function pct(v: string | number | null | undefined): string {
  const n = toNum(v);
  if (n === null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function pnlColor(v: string | number | null | undefined): string {
  const n = toNum(v);
  if (n === null || n === 0) return "text-ink";
  return n > 0 ? "text-success" : "text-danger";
}

function signed(v: string | number | null | undefined): string {
  const n = toNum(v);
  if (n === null) return "—";
  const s = usdCompact(Math.abs(n));
  return n > 0 ? `+${s}` : n < 0 ? `-${s}` : s;
}

export function WalletSummaryCard({ w }: { w: WalletSummary }) {
  const cells: { label: string; value: string; className?: string }[] = [
    { label: "Portfolio value", value: usdCompact(w.portfolio_value), className: "text-lime" },
    { label: "Total P&L", value: signed(w.total_pnl), className: pnlColor(w.total_pnl) },
    { label: "Realized", value: signed(w.realized_pnl), className: pnlColor(w.realized_pnl) },
    { label: "Unrealized", value: signed(w.unrealized_pnl), className: pnlColor(w.unrealized_pnl) },
    { label: "ROI", value: pct(w.roi) },
    { label: "Win rate", value: pct(w.win_rate) },
    { label: "Total volume", value: usdCompact(w.total_volume) },
    { label: "Buy volume", value: usdCompact(w.buy_volume) },
    { label: "Sell volume", value: usdCompact(w.sell_volume) },
    { label: "Trades", value: count(w.total_trades) },
    { label: "Tokens traded", value: count(w.tokens_traded) },
    { label: "Confidence", value: (w.pnl_confidence ?? "low").toUpperCase() },
  ];

  return (
    <div className="rounded-md border border-line bg-surface/40 p-2.5">
      <p className="font-mono text-[11px] uppercase tracking-widest text-ink-faint">Wallet P&amp;L</p>
      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {cells.map((c) => (
          <div key={c.label} className="rounded border border-line bg-canvas px-2 py-1.5">
            <p className={`tabular truncate font-mono text-[13px] ${c.className ?? "text-ink"}`}>
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
