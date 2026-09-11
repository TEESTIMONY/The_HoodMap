"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { MapEdge, MapNode } from "@/lib/api";
import { shortAddr } from "@/lib/format";

const LIME = "214, 250, 77";
const MOSS = "23, 176, 74";
const INK_FAINT = "103, 110, 122";
const DANGER = "251, 113, 133";

// One hue per cluster, biggest cluster first — lime (the brand accent) always
// marks whichever cluster controls the most supply, since that's the finding
// that matters most.
const CLUSTER_PALETTE = [
  LIME,
  "56, 189, 248", // sky
  "244, 114, 182", // pink
  "251, 191, 36", // amber
  "167, 139, 250", // violet
  "52, 211, 153", // emerald
  "251, 146, 60", // orange
  "34, 211, 238", // cyan
  "248, 113, 113", // red
  "163, 230, 53", // lime-2
];

export interface SimNode extends SimulationNodeDatum {
  id: string;
  raw: MapNode;
  r: number;
  color: string;
}
interface SimLink extends SimulationLinkDatum<SimNode> {
  kind: "token" | "native";
}

function buildNodes(nodes: MapNode[], clusterIndex: Map<string, number>): SimNode[] {
  const maxPct = Math.max(...nodes.map((n) => n.pct), 0.0001);
  const MIN_R = 5;
  const MAX_R = 46;
  return nodes.map((n) => {
    const t = Math.sqrt(Math.max(n.pct, 0) / maxPct);
    const r = n.isFunderOnly ? 6 : Math.max(MIN_R, t * MAX_R);
    const color = n.isPool
      ? MOSS
      : n.isBurn
        ? INK_FAINT
        : n.clusterId
          ? CLUSTER_PALETTE[(clusterIndex.get(n.clusterId) ?? 0) % CLUSTER_PALETTE.length]
          : INK_FAINT;
    return { id: n.address, raw: n, r, color };
  });
}

export function BubbleMap({
  nodes: dataNodes,
  edges: dataEdges,
  clusterOrder,
  selected,
  onSelect,
}: {
  nodes: MapNode[];
  edges: MapEdge[];
  /** cluster ids, ranked biggest-first — controls palette assignment */
  clusterOrder: string[];
  selected: string | null;
  onSelect: (address: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const viewRef = useRef({ x: 0, y: 0, k: 1 });
  const dragRef = useRef<{ node: SimNode | null; moved: boolean; panning: boolean; lastX: number; lastY: number }>(
    { node: null, moved: false, panning: false, lastX: 0, lastY: 0 }
  );
  const hoverRef = useRef<SimNode | null>(null);
  const selectedRef = useRef<string | null>(selected);
  const [hoverInfo, setHoverInfo] = useState<{ node: SimNode; x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);

  const clusterIndex = useMemo(() => {
    const m = new Map<string, number>();
    clusterOrder.forEach((id, i) => m.set(id, i));
    return m;
  }, [clusterOrder]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const nodes = buildNodes(dataNodes, clusterIndex);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links: SimLink[] = dataEdges
      .filter((e) => byId.has(e.from) && byId.has(e.to))
      .map((e) => ({ source: e.from, target: e.to, kind: e.kind }));
    nodesRef.current = nodes;
    linksRef.current = links;

    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const sim = forceSimulation(nodes)
      .force("charge", forceManyBody().strength(-24))
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance(36)
          .strength(0.7)
      )
      .force(
        "collide",
        forceCollide<SimNode>((d) => d.r + 3).strength(1)
      )
      // Pull every node toward the middle individually (not just the
      // centroid, which is all forceCenter does) — this is what makes
      // unlinked nodes still gravitate into one packed mass instead of
      // drifting off into empty canvas.
      .force("x", forceX(0).strength(0.045))
      .force("y", forceY(0).strength(0.045))
      .alphaDecay(reduceMotion ? 0.2 : 0.018)
      .velocityDecay(0.4);
    simRef.current = sim;

    let fitted = false;
    const fitView = () => {
      if (fitted || nodes.length === 0) return;
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (const n of nodes) {
        minX = Math.min(minX, (n.x ?? 0) - n.r);
        maxX = Math.max(maxX, (n.x ?? 0) + n.r);
        minY = Math.min(minY, (n.y ?? 0) - n.r);
        maxY = Math.max(maxY, (n.y ?? 0) + n.r);
      }
      const w = Math.max(1, maxX - minX);
      const h = Math.max(1, maxY - minY);
      const k = Math.min(2.2, Math.max(0.4, Math.min(width / (w * 1.3), height / (h * 1.3))));
      if (Number.isFinite(k)) {
        viewRef.current.k = k;
        viewRef.current.x = -(minX + maxX) / 2;
        viewRef.current.y = -(minY + maxY) / 2;
        fitted = true;
      }
    };

    // Gentle ambient drift so the graph never looks perfectly static, even at
    // rest — small, slow, and independent of the physics so it can't jitter.
    let t = 0;
    let raf = 0;

    const worldToScreen = (x: number, y: number) => ({
      x: width / 2 + (x + viewRef.current.x) * viewRef.current.k,
      y: height / 2 + (y + viewRef.current.y) * viewRef.current.k,
    });
    const screenToWorld = (x: number, y: number) => ({
      x: (x - width / 2) / viewRef.current.k - viewRef.current.x,
      y: (y - height / 2) / viewRef.current.k - viewRef.current.y,
    });

    const draw = () => {
      ctx.fillStyle = "#06070a";
      ctx.fillRect(0, 0, width, height);

      const activeCluster = selectedRef.current
        ? byId.get(selectedRef.current)?.raw.clusterId
        : null;

      // edges
      for (const l of links) {
        const s = l.source as SimNode;
        const e = l.target as SimNode;
        if (typeof s !== "object" || typeof e !== "object") continue;
        const a = worldToScreen(s.x ?? 0, s.y ?? 0);
        const b = worldToScreen(e.x ?? 0, e.y ?? 0);
        const dim = activeCluster && e.raw.clusterId !== activeCluster;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle =
          l.kind === "token"
            ? `rgba(${LIME}, ${dim ? 0.06 : 0.4})`
            : `rgba(${INK_FAINT}, ${dim ? 0.04 : 0.35})`;
        ctx.lineWidth = Math.max(1, 1.4 * viewRef.current.k);
        ctx.setLineDash(l.kind === "native" ? [2, 4] : []);
        ctx.stroke();
        ctx.setLineDash([]);

        // arrowhead at the funded end
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const back = e.r * viewRef.current.k + 3;
        const tipX = b.x - Math.cos(ang) * back;
        const tipY = b.y - Math.sin(ang) * back;
        const asz = 4 * Math.min(1.4, viewRef.current.k);
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - Math.cos(ang - 0.5) * asz, tipY - Math.sin(ang - 0.5) * asz);
        ctx.lineTo(tipX - Math.cos(ang + 0.5) * asz, tipY - Math.sin(ang + 0.5) * asz);
        ctx.closePath();
        ctx.fillStyle =
          l.kind === "token" ? `rgba(${LIME}, ${dim ? 0.08 : 0.55})` : `rgba(${INK_FAINT}, ${dim ? 0.06 : 0.45})`;
        ctx.fill();
      }

      // nodes
      const sorted = [...nodes].sort((a, b) => a.r - b.r);
      for (const n of sorted) {
        const p = worldToScreen(n.x ?? 0, n.y ?? 0);
        const r = Math.max(1.2, n.r * viewRef.current.k);
        const isSelected = n.id === selectedRef.current;
        const dim = activeCluster ? n.raw.clusterId !== activeCluster && !isSelected : false;
        const alpha = dim ? 0.18 : 1;

        if (!dim && (isSelected || n.raw.clusterId)) {
          ctx.save();
          ctx.shadowColor = `rgba(${n.color}, 0.9)`;
          ctx.shadowBlur = isSelected ? 22 : 10;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${n.color}, ${0.16 * alpha})`;
          ctx.fill();
          ctx.restore();
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = n.raw.isFunderOnly
          ? "rgba(6,7,10,0.9)"
          : `rgba(${n.color}, ${(n.raw.isPool ? 0.5 : 0.32) * alpha})`;
        ctx.fill();
        ctx.lineWidth = isSelected ? 2.5 : n.raw.isFunderOnly ? 1.2 : 1.4;
        ctx.strokeStyle = `rgba(${n.color}, ${(isSelected ? 1 : 0.85) * alpha})`;
        if (n.raw.isFunderOnly) ctx.setLineDash([2, 2]);
        ctx.stroke();
        ctx.setLineDash([]);

        if (r > 13 && !dim) {
          ctx.fillStyle = `rgba(244,245,247,${alpha})`;
          ctx.font = `${n.raw.isPool ? "600 " : "500 "}${Math.min(12, r * 0.42)}px "Geist Mono", monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const label = n.raw.isPool ? "POOL" : n.raw.isBurn ? "BURN" : shortAddr(n.raw.address);
          ctx.fillText(label, p.x, p.y);
        }
      }

      const hn = hoverRef.current;
      if (hn) {
        const p = worldToScreen(hn.x ?? 0, hn.y ?? 0);
        const r = Math.max(1.2, hn.r * viewRef.current.k);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(244,245,247,0.9)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    };

    sim.on("tick", () => {
      if (sim.alpha() < 0.15) fitView();
      draw();
    });

    const idleLoop = () => {
      t += 1;
      if (sim.alpha() < sim.alphaMin() && !reduceMotion) draw();
      raf = requestAnimationFrame(idleLoop);
    };
    if (!reduceMotion) raf = requestAnimationFrame(idleLoop);
    setReady(true);

    const hitTest = (sx: number, sy: number): SimNode | null => {
      const w = screenToWorld(sx, sy);
      let best: SimNode | null = null;
      let bestD = Infinity;
      for (const n of nodes) {
        const dx = (n.x ?? 0) - w.x;
        const dy = (n.y ?? 0) - w.y;
        const d = Math.hypot(dx, dy);
        if (d <= n.r + 3 && d < bestD) {
          bestD = d;
          best = n;
        }
      }
      return best;
    };

    const onDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const hit = hitTest(sx, sy);
      dragRef.current = { node: hit, moved: false, panning: !hit, lastX: e.clientX, lastY: e.clientY };
      if (hit) {
        hit.fx = hit.x;
        hit.fy = hit.y;
        sim.alphaTarget(0.25).restart();
      }
      canvas.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const d = dragRef.current;
      if (d.node) {
        const w = screenToWorld(sx, sy);
        d.node.fx = w.x;
        d.node.fy = w.y;
        d.moved = true;
        draw();
      } else if (d.panning && (e.buttons & 1) === 1) {
        viewRef.current.x += (e.clientX - d.lastX) / viewRef.current.k;
        viewRef.current.y += (e.clientY - d.lastY) / viewRef.current.k;
        d.lastX = e.clientX;
        d.lastY = e.clientY;
        d.moved = true;
        draw();
      } else {
        const hit = hitTest(sx, sy);
        hoverRef.current = hit;
        setHoverInfo(hit ? { node: hit, x: sx, y: sy } : null);
        canvas.style.cursor = hit ? "pointer" : "grab";
        draw();
      }
    };

    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      if (d.node) {
        d.node.fx = null;
        d.node.fy = null;
        sim.alphaTarget(0);
        if (!d.moved) onSelect(d.node.id === selectedRef.current ? null : d.node.id);
      } else if (!d.moved) {
        onSelect(null);
      }
      dragRef.current = { node: null, moved: false, panning: false, lastX: 0, lastY: 0 };
      canvas.releasePointerCapture(e.pointerId);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const before = screenToWorld(sx, sy);
      const factor = Math.exp(-e.deltaY * 0.0012);
      viewRef.current.k = Math.min(4, Math.max(0.25, viewRef.current.k * factor));
      const after = screenToWorld(sx, sy);
      viewRef.current.x += after.x - before.x;
      viewRef.current.y += after.y - before.y;
      draw();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      sim.stop();
      ro.disconnect();
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataNodes, dataEdges, clusterIndex]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden rounded-md bg-canvas">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full touch-none" />

      {hoverInfo && (
        <div
          className="pointer-events-none absolute z-20 rounded-lg border border-line-strong bg-surface/95 px-3 py-2 font-mono text-[11px] text-ink shadow-[0_20px_50px_-15px_rgba(0,0,0,0.9)] backdrop-blur-md"
          style={{
            left: Math.min(hoverInfo.x + 14, (containerRef.current?.clientWidth ?? 300) - 190),
            top: Math.max(hoverInfo.y - 10, 8),
          }}
        >
          <p className="font-semibold text-ink">
            {hoverInfo.node.raw.isPool
              ? "Liquidity pool"
              : hoverInfo.node.raw.isBurn
                ? "Burn address"
                : hoverInfo.node.raw.isFunderOnly
                  ? "Funding source"
                  : shortAddr(hoverInfo.node.raw.address)}
          </p>
          {!hoverInfo.node.raw.isFunderOnly && (
            <p className="tabular mt-0.5 text-ink-muted">{hoverInfo.node.raw.pct.toFixed(3)}% of supply</p>
          )}
          {hoverInfo.node.raw.clusterId && (
            <p className="mt-0.5 text-ink-faint">
              funded by {shortAddr(hoverInfo.node.raw.clusterId)}
            </p>
          )}
        </div>
      )}

      {/* legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-col gap-1.5 rounded-lg border border-line bg-surface/70 px-3 py-2.5 font-mono text-[10px] text-ink-muted backdrop-blur-md">
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border border-lime/70 bg-lime/25" />
          bubble size = share of supply
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: `rgba(${MOSS},0.6)` }} />
          liquidity pool
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-px w-3 bg-lime/60" />
          same cluster, direct transfer
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-px w-3 border-t border-dashed border-ink-faint" />
          same cluster, shared gas funder
        </div>
      </div>

      {!ready && (
        <div className="absolute inset-0 grid place-items-center bg-canvas">
          <span className="font-mono text-[12px] text-ink-faint">Laying out the graph…</span>
        </div>
      )}
    </div>
  );
}
