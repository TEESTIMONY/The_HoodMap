import type { TokenReport } from "@/lib/api";

const GRADE_COLOR: Record<string, string> = {
  A: "#34D399",
  B: "#7CE38A",
  C: "#FBBF24",
  D: "#FB923C",
  E: "#FB7185",
  F: "#EF4444",
};
const GRADE_LABEL: Record<string, string> = {
  A: "Healthy distribution",
  B: "Mostly healthy",
  C: "Some concentration",
  D: "Concentrated",
  E: "Highly concentrated",
  F: "Extreme concentration",
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-line bg-canvas px-1.5 py-1.5 text-center">
      <p className="tabular font-mono text-[13px] text-ink">{value}</p>
      <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-ink-faint">{label}</p>
    </div>
  );
}

export function HoodScoreCard({ report }: { report: TokenReport | null }) {
  const hs = report?.hoodscore;
  const h = report?.holders;

  if (!hs) {
    return (
      <div className="rounded-md border border-line bg-surface/40 p-2.5">
        <p className="font-mono text-[11px] uppercase tracking-widest text-ink-faint">HoodScore</p>
        <p className="mt-2 text-[13px] text-ink-muted">
          {report?.note ?? "Not enough transfer data indexed to grade this token yet."}
        </p>
      </div>
    );
  }

  const color = GRADE_COLOR[hs.grade];
  const r = 52;
  const circ = 2 * Math.PI * r;
  const filled = circ * (hs.score / 100);

  return (
    <div className="rounded-md border border-line bg-surface/40 p-2.5">
      <p className="font-mono text-[11px] uppercase tracking-widest text-ink-faint">HoodScore</p>

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
            <span className="font-display text-[2.75rem] font-bold leading-none" style={{ color }}>
              {hs.grade}
            </span>
            <span className="mt-1 font-mono text-[11px] text-ink-faint">{hs.score} / 100</span>
          </div>
        </div>
        <p className="mt-1.5 font-mono text-[13px] font-semibold text-ink">{GRADE_LABEL[hs.grade]}</p>
      </div>

      {h && (
        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          <Metric label="Largest" value={`${h.top1_pct.toFixed(1)}%`} />
          <Metric label="Top 10" value={`${h.top10_pct.toFixed(1)}%`} />
          <Metric label="In pools" value={`${h.pool_pct.toFixed(1)}%`} />
        </div>
      )}

      <ul className="mt-2.5 space-y-1">
        {hs.reasons.map((rsn, i) => (
          <li key={i} className="flex gap-2 text-[12px] leading-snug text-ink-muted">
            <span
              className="mt-1.5 size-1 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            {rsn}
          </li>
        ))}
      </ul>

      {report?.note && <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">{report.note}</p>}
    </div>
  );
}
