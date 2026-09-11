"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SiteNav } from "@/components/site/site-nav";
import { ScanInput } from "@/components/site/scan-input";
import { CopyButton } from "@/components/ui/copy-button";
import { TokenIcon } from "@/components/ui/token-icon";
import { BubbleMap } from "@/components/map/bubble-map";
import { ClusterList } from "@/components/map/cluster-list";
import { NodeDetail } from "@/components/map/node-detail";
import { fetchToken, fetchTokenMap, type TokenDetail, type TokenMap } from "@/lib/api";
import { shortAddr } from "@/lib/format";

const ADDR = /^0x[0-9a-fA-F]{40}$/;

type State = "loading" | "ready" | "notfound" | "invalid" | "error";

export default function HoodMapViewPage() {
  const params = useParams<{ address: string }>();
  const address = (params.address || "").toLowerCase();

  const [t, setT] = useState<TokenDetail | null>(null);
  const [map, setMap] = useState<TokenMap | null>(null);
  const [state, setState] = useState<State>("loading");
  const [mapLoading, setMapLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    if (!ADDR.test(address)) {
      setState("invalid");
      return;
    }
    const ac = new AbortController();
    setState("loading");
    setMapLoading(true);
    setSelected(null);

    fetchToken(address, ac.signal)
      .then((d) => {
        setT(d);
        setState("ready");
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setState(e instanceof Error && e.message.includes("-> 404") ? "notfound" : "error");
      });

    fetchTokenMap(address, ac.signal)
      .then(setMap)
      .catch(() => {})
      .finally(() => setMapLoading(false));

    return () => ac.abort();
  }, [address]);

  const sym = (t?.symbol || "?").toUpperCase();
  const clusterOrder = useMemo(() => map?.clusters.map((c) => c.id) ?? [], [map]);
  const selectedNode = useMemo(
    () => map?.nodes.find((n) => n.address === selected) ?? null,
    [map, selected]
  );
  const selectedCluster = useMemo(
    () => (selectedNode?.clusterId ? map?.clusters.find((c) => c.id === selectedNode.clusterId) ?? null : null),
    [map, selectedNode]
  );

  return (
    // same viewport-pinned shell as the scan page — the graph is the one
    // thing on this page that should never be smaller than the space it's given.
    <main className="relative min-h-[100svh] bg-canvas lg:h-screen lg:overflow-hidden">
      <SiteNav />

      <div className="w-full px-1 pb-8 pt-[76px] sm:px-1.5 sm:pt-20 lg:flex lg:h-full lg:flex-col lg:overflow-hidden lg:pb-1.5 lg:pt-[88px]">
        <div className="lg:shrink-0">
          <ScanInput
            className="max-w-none"
            hideHint
            basePath="/map"
            placeholder="Paste a Robinhood Chain contract (0x…)"
          />
        </div>

        {state === "invalid" && (
          <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[13px] text-danger">
            That doesn&apos;t look like a contract address.
          </p>
        )}

        {state === "notfound" && (
          <div className="mt-3 rounded-md border border-line bg-surface/40 px-4 py-8 text-center">
            <p className="font-mono text-[14px] text-ink">Not an ERC-20 on Robinhood Chain</p>
            <p className="mt-2 font-mono text-[12px] text-ink-faint">{shortAddr(address)}</p>
          </div>
        )}

        {state === "error" && (
          <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[13px] text-danger">
            Couldn&apos;t reach the analytics API. Start it and refresh.
          </p>
        )}

        {(state === "loading" || state === "ready") && (
          <div className="mt-2 flex flex-col gap-2 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
            <div className="grid gap-2 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_340px] lg:overflow-hidden xl:grid-cols-[minmax(0,1fr)_380px]">
              {/* left — the bubble map, full height, nothing else competing for space */}
              <div className="order-2 min-h-[420px] min-w-0 lg:order-1 lg:min-h-0">
                {mapLoading ? (
                  <div className="grid h-full place-items-center rounded-md border border-line bg-surface/40">
                    <span className="font-mono text-[12px] text-ink-faint">Tracing holders and funders…</span>
                  </div>
                ) : !map || map.nodes.length === 0 ? (
                  <div className="grid h-full place-items-center rounded-md border border-line bg-surface/40 px-6 text-center">
                    <p className="font-mono text-[13px] text-ink-muted">
                      {map?.note ?? "No holder transfers indexed for this token yet."}
                    </p>
                  </div>
                ) : (
                  <BubbleMap
                    nodes={map.nodes}
                    edges={map.edges}
                    clusterOrder={clusterOrder}
                    selected={selected}
                    onSelect={setSelected}
                  />
                )}
              </div>

              {/* right — token identity (pinned) + clusters / selection (scrolls) */}
              <div className="order-1 flex flex-col gap-1.5 lg:order-2 lg:h-full lg:min-h-0">
                <div className="flex items-start gap-2 px-1 lg:shrink-0">
                  <TokenIcon
                    address={address}
                    symbol={state === "loading" ? null : sym}
                    className="size-9 rounded-md"
                    textClassName="text-[14px]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {state === "loading" ? (
                        <span className="my-1 block h-5 w-24 animate-pulse rounded bg-surface-3" />
                      ) : (
                        <h1 className="truncate font-display text-lg font-bold uppercase text-ink">
                          {sym}
                        </h1>
                      )}
                      {t?.name && (
                        <span className="truncate font-mono text-[12px] text-ink-faint">{t.name}</span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-ink-faint">
                      <span>{shortAddr(address)}</span>
                      <CopyButton value={address} label="contract address" />
                      {map && <span>· {map.holderCount} holders</span>}
                      <a
                        href={`/scan/${address}`}
                        className="inline-flex items-center gap-1 text-ink-muted transition-colors hover:text-ink"
                      >
                        Scan
                        <ArrowUpRight className="size-3" />
                      </a>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                  {map ? (
                    <>
                      <ClusterList
                        clusters={map.clusters}
                        clusteredPct={map.clusteredPct}
                        selected={selectedNode?.clusterId ?? null}
                        onSelect={(funder) => setSelected(funder)}
                      />
                      <NodeDetail node={selectedNode} cluster={selectedCluster} decimals={t?.decimals ?? null} />
                    </>
                  ) : (
                    <div
                      className={cn(
                        "rounded-md border border-line bg-surface/40",
                        mapLoading && "h-56 animate-pulse"
                      )}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
