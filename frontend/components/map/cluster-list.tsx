import { cn } from "@/lib/utils";
import type { MapCluster } from "@/lib/api";
import { shortAddr } from "@/lib/format";

const CLUSTER_PALETTE = [
  "214, 250, 77",
  "56, 189, 248",
  "244, 114, 182",
  "251, 191, 36",
  "167, 139, 250",
  "52, 211, 153",
  "251, 146, 60",
  "34, 211, 238",
  "248, 113, 113",
  "163, 230, 53",
];

export function ClusterList({
  clusters,
  clusteredPct,
  selected,
  onSelect,
}: {
  clusters: MapCluster[];
  clusteredPct: number;
  selected: string | null;
  onSelect: (funder: string | null) => void;
}) {
  return (
    <div className="rounded-md border border-line bg-surface/40 p-2.5">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-widest text-ink-faint">Clusters</p>
        {clusters.length > 0 && (
          <span className="tabular font-mono text-[11px] text-lime">
            {clusteredPct.toFixed(1)}% clustered
          </span>
        )}
      </div>

      {clusters.length === 0 ? (
        <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
          No two top holders share a detected funder — nothing here reads as coordinated.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {clusters.map((c, i) => {
            const color = CLUSTER_PALETTE[i % CLUSTER_PALETTE.length];
            const isSelected = selected === c.funder;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(isSelected ? null : c.funder)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left transition-colors",
                    isSelected
                      ? "border-line-strong bg-surface-3"
                      : "border-line bg-canvas hover:border-line-strong"
                  )}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: `rgba(${color}, 0.9)`, boxShadow: `0 0 8px rgba(${color},0.6)` }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[12px] text-ink">
                      {shortAddr(c.funder)}
                    </span>
                    <span className="block font-mono text-[10px] text-ink-faint">
                      {c.memberCount} wallets funded
                    </span>
                  </span>
                  <span className="tabular shrink-0 font-mono text-[12px] font-semibold text-ink">
                    {c.totalPct.toFixed(2)}%
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
