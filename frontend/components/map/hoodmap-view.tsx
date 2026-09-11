"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchTokenMap, type TokenMap } from "@/lib/api";
import { BubbleMap } from "./bubble-map";
import { ClusterLegend } from "./cluster-legend";
import { WalletDetailPanel } from "./wallet-detail-panel";

/**
 * The whole HoodMap experience — legend, bubble map, and the wallet detail
 * panel that appears below it — self-contained so it can drop into either
 * the full /map page or a modal opened from the scan page's HoodMap tab.
 */
export function HoodMapView({
  tokenAddress,
  decimals,
  price,
}: {
  tokenAddress: string;
  decimals: number | null;
  price: string | null;
}) {
  const [map, setMap] = useState<TokenMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setMap(null);
    setSelected(null);
    fetchTokenMap(tokenAddress, ac.signal)
      .then(setMap)
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [tokenAddress]);

  const clusterOrder = useMemo(() => map?.clusters.map((c) => c.id) ?? [], [map]);
  const selectedNode = useMemo(
    () => map?.nodes.find((n) => n.address === selected) ?? null,
    [map, selected]
  );
  const selectedCluster = useMemo(
    () => (selectedNode?.clusterId ? map?.clusters.find((c) => c.id === selectedNode.clusterId) ?? null : null),
    [map, selectedNode]
  );
  const rank = useMemo(() => {
    if (!map || !selectedNode) return 0;
    return map.nodes.findIndex((n) => n.address === selectedNode.address) + 1;
  }, [map, selectedNode]);

  if (loading) {
    return (
      <div className="grid h-full min-h-[360px] place-items-center rounded-md border border-line bg-surface/40">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-6 animate-spin text-lime" />
          <span className="font-mono text-[12px] text-ink-faint">Tracing holders and funders…</span>
        </div>
      </div>
    );
  }

  if (!map || map.nodes.length === 0) {
    return (
      <div className="grid h-full min-h-[360px] place-items-center rounded-md border border-line bg-surface/40 px-6 text-center">
        <p className="font-mono text-[13px] text-ink-muted">
          {map?.note ?? "No holder transfers indexed for this token yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {map.clusters.length > 0 && (
        <ClusterLegend
          clusters={map.clusters}
          selectedClusterId={selectedNode?.clusterId ?? null}
          onSelectCluster={(clusterId) => {
            if (!clusterId) return setSelected(null);
            const cluster = map.clusters.find((c) => c.id === clusterId);
            setSelected(cluster?.members[0] ?? null);
          }}
        />
      )}

      <div className="min-h-[340px] flex-1">
        <BubbleMap
          tokenAddress={tokenAddress}
          nodes={map.nodes}
          edges={map.edges}
          clusterOrder={clusterOrder}
          selected={selected}
          onSelect={setSelected}
        />
      </div>

      {selectedNode && (
        <div className="shrink-0">
          <WalletDetailPanel
            tokenAddress={tokenAddress}
            node={selectedNode}
            rank={rank}
            cluster={selectedCluster}
            decimals={decimals}
            price={price}
          />
        </div>
      )}
    </div>
  );
}
