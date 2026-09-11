import { cn } from "@/lib/utils";
import type { MapCluster } from "@/lib/api";
import { shortAddr } from "@/lib/format";
import { clusterColor, UNCLUSTERED_RGB } from "./colors";

export function ClusterLegend({
  clusters,
  selectedClusterId,
  onSelectCluster,
}: {
  clusters: MapCluster[];
  selectedClusterId: string | null;
  onSelectCluster: (clusterId: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
      {clusters.map((c, i) => {
        const color = clusterColor(i, clusters.length);
        const isSelected = selectedClusterId === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelectCluster(isSelected ? null : c.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors",
              isSelected
                ? "border-line-strong bg-surface-3 text-ink"
                : "border-line bg-surface/50 text-ink-muted hover:border-line-strong hover:text-ink"
            )}
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: `rgba(${color}, 0.95)`, boxShadow: `0 0 6px rgba(${color},0.7)` }}
            />
            {shortAddr(c.funder)}
            <span className="tabular text-ink-faint">{c.totalPct.toFixed(1)}%</span>
          </button>
        );
      })}
      <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface/50 px-2.5 py-1 font-mono text-[11px] text-ink-faint">
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: `rgba(${UNCLUSTERED_RGB}, 0.9)` }} />
        Unclustered
      </span>
    </div>
  );
}
