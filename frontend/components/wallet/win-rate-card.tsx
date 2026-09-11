import type { WalletSummary } from "@/lib/api";
import { toNum, usdCompact } from "@/lib/format";

const CONFIDENCE_COLOR: Record<string, string> = {
  high: "#34D399",
  medium: "#FBBF24",
  low: "#FB7185",
};

function holdingLabel(hours: string | number | null): string {
  const n = toNum(hours);
  if (n === null) return "—";
  if (n < 1) return `${Math.round(n * 60)}m`;
  if (n < 24) return `${n.toFixed(1)}h`;
  return `${(n / 24).toFixed(1)}d`;
}

function tierLabel(winRate: number | null, trades: number | null): string {
  if (!trades) return "No graded trades yet";
  if (winRate === null) return "Not enough data";
  if (winRate >= 0.6) return "Consistently profitable";
  if (winRate >= 0.45) return "Mixed record";
  return "Losing more than winning";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-line bg-canvas px-1.5 py-1.5 text-center">
      <p className="tabular font-mono text-[13px] text-ink">{value}</p>
      <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-ink-faint">{label}</p>
    </div>
  );
}

export function WinRateCard({ w }: { w: WalletSummary }) {
  if (!w.has_trades) {
    return (
      <div className="rounded-md border border-line bg-surface/40 p-2.5">
        <p className="font-mono text-[11px] uppercase tracking-widest text-ink-faint">Track record</p>
        <p className="mt-2 text-[13px] text-ink-muted">
          No DEX trades indexed for this wallet yet.
        </p>
      </div>
    );
  }

  const winRate = toNum(w.win_rate);
  const totalPnl = toNum(w.total_pnl) ?? 0;
  const color = totalPnl > 0 ? "#34D399" : totalPnl < 0 ? "#FB7185" : "#9AA1AE";
  const r = 52;
  const circ = 2 * Math.PI * r;
  const filled = circ * (winRate ?? 0);

  const confColor = CONFIDENCE_COLOR[w.pnl_confidence ?? "low"];
  const unmatched = toNum(w.unmatched_pnl) ?? 0;

  return (
    <div className="rounded-md border border-line bg-surface/40 p-2.5">
      <p className="font-mono text-[11px] uppercase tracking-widest text-ink-faint">Track record</p>

      <div className="mt-2 flex flex-col items-center">
        <div className="relative">
          <svg width="132" height="132" viewBox="0 0 148 148" className="-rotate-90">
            <circle cx="74" cy="74" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="9" />
            <circle
              cx="74"
              cy="74"
              r={r}
              fill="none"
              stroke={color}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${filled} ${circ}`}
              style={{ filter: `drop-shadow(0 0 10px ${color}66)` }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-[2.2rem] font-bold leading-none" style={{ color }}>
              {winRate === null ? "—" : `${Math.round(winRate * 100)}%`}
            </span>
            <span className="mt-1 font-mono text-[10px] text-ink-faint">win rate</span>
          </div>
        </div>
        <p className="mt-1.5 font-mono text-[13px] font-semibold text-ink">
          {tierLabel(winRate, w.total_trades)}
        </p>
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        <Metric label="Winning" value={String(w.winning_trades ?? 0)} />
        <Metric label="Losing" value={String(w.losing_trades ?? 0)} />
        <Metric label="Breakeven" value={String(w.breakeven_trades ?? 0)} />
      </div>

      <ul className="mt-2.5 space-y-1">
        <li className="flex gap-2 text-[12px] leading-snug text-ink-muted">
          <span className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-faint" />
          {w.open_positions ?? 0} open position{w.open_positions === 1 ? "" : "s"} ·{" "}
          {w.closed_positions ?? 0} closed
        </li>
        <li className="flex gap-2 text-[12px] leading-snug text-ink-muted">
          <span className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-faint" />
          Average hold {holdingLabel(w.avg_holding_hours)}
        </li>
        {(w.zero_cost_positions ?? 0) > 0 && (
          <li className="flex gap-2 text-[12px] leading-snug text-ink-muted">
            <span
              className="mt-1.5 size-1 shrink-0 rounded-full"
              style={{ backgroundColor: confColor }}
            />
            {w.zero_cost_positions} position{w.zero_cost_positions === 1 ? "" : "s"} with no tracked
            cost basis — {usdCompact(Math.abs(unmatched))} of P&amp;L is unmatched
          </li>
        )}
        <li className="flex gap-2 text-[12px] leading-snug text-ink-muted">
          <span
            className="mt-1.5 size-1 shrink-0 rounded-full"
            style={{ backgroundColor: confColor }}
          />
          Confidence: {(w.pnl_confidence ?? "low").toUpperCase()}
        </li>
      </ul>

      <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
        Built from DEX swaps HoodMap has indexed for this wallet — buys before the indexed window
        or tokens received by transfer/airdrop show as unmatched rather than certain profit.
      </p>
    </div>
  );
}
