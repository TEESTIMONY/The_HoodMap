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
import { Minus, Plus, Scan } from "lucide-react";
import type { MapEdge, MapNode } from "@/lib/api";
import { shortAddr } from "@/lib/format";
import { clusterColor, POOL_RGB, ROLE_COLOR, UNCLUSTERED_RGB } from "./colors";

const LIME = "214, 250, 77";
const MIN_R = 3.5;
const MAX_R = 44;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.5;

export interface SimNode extends SimulationNodeDatum {
  id: string;
  raw: MapNode;
  r: number;
  color: string;
  wobblePhase: number;
  wobbleSpeed: number;
  wobbleAmp: number;
}
interface SimLink extends SimulationLinkDatum<SimNode> {
  kind: MapEdge["kind"];
  directed: boolean;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildNodes(seedKey: string, dataNodes: MapNode[], clusterIdx: Map<string, number>, clusterCount: number): SimNode[] {
  const rng = mulberry32(hashStr(seedKey));
  const maxPct = Math.max(...dataNodes.map((n) => n.pct), 0.0001);
  return dataNodes.map((n) => {
    const t = Math.sqrt(Math.max(n.pct, 0) / maxPct);
    const r = Math.max(MIN_R, t * MAX_R);
    const color = n.isPool
      ? POOL_RGB
      : n.isBurn
        ? ROLE_COLOR.burn
        : n.clusterId
          ? clusterColor(clusterIdx.get(n.clusterId) ?? 0, clusterCount)
          : UNCLUSTERED_RGB;
    // deterministic seeded scatter, so re-opening the same token's map
    // starts from the same place every time
    const angle = rng() * Math.PI * 2;
    const dist = 40 + rng() * 220;
    return {
      id: n.address,
      raw: n,
      r,
      color,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      wobblePhase: rng() * Math.PI * 2,
      wobbleSpeed: 0.4 + rng() * 0.5,
      wobbleAmp: 1.5 + rng() * 2.5,
    };
  });
}

export function BubbleMap({
  tokenAddress,
  nodes: dataNodes,
  edges: dataEdges,
  clusterOrder,
  selected,
  onSelect,
}: {
  tokenAddress: string;
  nodes: MapNode[];
  edges: MapEdge[];
  /** cluster ids, ranked biggest-first — controls hue assignment */
  clusterOrder: string[];
  selected: string | null;
  onSelect: (address: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const viewRef = useRef({ x: 0, y: 0, k: 1 });
  const viewTweenRef = useRef<{ from: typeof viewRef.current; to: typeof viewRef.current; t0: number; dur: number } | null>(null);
  const dragRef = useRef<{ node: SimNode | null; moved: boolean; panning: boolean; lastX: number; lastY: number }>(
    { node: null, moved: false, panning: false, lastX: 0, lastY: 0 }
  );
  const hoverRef = useRef<SimNode | null>(null);
  const selectedRef = useRef<string | null>(selected);
  const [hoverInfo, setHoverInfo] = useState<{ node: SimNode; x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);
  const fitRef = useRef<() => void>(() => {});

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

    const nodes = buildNodes(tokenAddress, dataNodes, clusterIndex, clusterOrder.length);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links: SimLink[] = dataEdges
      .filter((e) => byId.has(e.from) && byId.has(e.to))
      .map((e) => ({ source: e.from, target: e.to, kind: e.kind, directed: e.directed }));

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
          .distance(34)
          .strength(0.7)
      )
      .force("collide", forceCollide<SimNode>((d) => d.r + 3).strength(1))
      .force("x", forceX(0).strength(0.045))
      .force("y", forceY(0).strength(0.045))
      .alphaDecay(reduceMotion ? 0.2 : 0.018)
      .velocityDecay(0.4);
    simRef.current = sim;

    let fitted = false;
    const fitView = (animated = false) => {
      if (nodes.length === 0) return;
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
      const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min(width / (w * 1.25), height / (h * 1.25))));
      if (!Number.isFinite(k)) return;
      const target = { k, x: -(minX + maxX) / 2, y: -(minY + maxY) / 2 };
      if (animated) tweenTo(target);
      else viewRef.current = target;
      fitted = true;
    };
    fitRef.current = () => fitView(true);

    const tweenTo = (to: { x: number; y: number; k: number }) => {
      viewTweenRef.current = { from: { ...viewRef.current }, to, t0: performance.now(), dur: 420 };
    };

    const worldToScreen = (x: number, y: number) => ({
      x: width / 2 + (x + viewRef.current.x) * viewRef.current.k,
      y: height / 2 + (y + viewRef.current.y) * viewRef.current.k,
    });
    const screenToWorld = (x: number, y: number) => ({
      x: (x - width / 2) / viewRef.current.k - viewRef.current.x,
      y: (y - height / 2) / viewRef.current.k - viewRef.current.y,
    });

    const draw = (tSec: number, settled: boolean) => {
      ctx.fillStyle = "#06070a";
      ctx.fillRect(0, 0, width, height);

      const activeCluster = selectedRef.current
        ? byId.get(selectedRef.current)?.raw.clusterId
        : null;

      const pos = (n: SimNode) => {
        const wobble = settled && !reduceMotion ? 1 : 0;
        return {
          x: (n.x ?? 0) + Math.sin(tSec * n.wobbleSpeed + n.wobblePhase) * n.wobbleAmp * wobble,
          y: (n.y ?? 0) + Math.cos(tSec * n.wobbleSpeed * 1.3 + n.wobblePhase) * n.wobbleAmp * wobble,
        };
      };

      // edges — gentle curve, arrowhead only when the direction is real
      for (const l of links) {
        const s = l.source as SimNode;
        const e = l.target as SimNode;
        if (typeof s !== "object" || typeof e !== "object") continue;
        const sp = pos(s);
        const ep = pos(e);
        const a = worldToScreen(sp.x, sp.y);
        const b = worldToScreen(ep.x, ep.y);
        const dim = activeCluster && e.raw.clusterId !== activeCluster && s.raw.clusterId !== activeCluster;

        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1;
        const bow = Math.min(30, dist * 0.18);
        const cx = mx - (dy / dist) * bow;
        const cy = my + (dx / dist) * bow;

        const color = l.kind === "token" ? LIME : l.kind === "native" ? "154, 161, 174" : e.color;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(cx, cy, b.x, b.y);
        ctx.strokeStyle = `rgba(${color}, ${dim ? 0.06 : l.directed ? 0.42 : 0.3})`;
        ctx.lineWidth = Math.max(1, (l.directed ? 1.4 : 1) * viewRef.current.k);
        if (l.kind === "native") ctx.setLineDash([2, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        if (l.directed) {
          const ang = Math.atan2(b.y - cy, b.x - cx);
          const back = e.r * viewRef.current.k + 3;
          const tipX = b.x - Math.cos(ang) * back;
          const tipY = b.y - Math.sin(ang) * back;
          const asz = 4 * Math.min(1.4, viewRef.current.k);
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(tipX - Math.cos(ang - 0.5) * asz, tipY - Math.sin(ang - 0.5) * asz);
          ctx.lineTo(tipX - Math.cos(ang + 0.5) * asz, tipY - Math.sin(ang + 0.5) * asz);
          ctx.closePath();
          ctx.fillStyle = `rgba(${color}, ${dim ? 0.08 : 0.6})`;
          ctx.fill();
        }
      }

      // nodes, smallest first so big bubbles never bury small ones' outlines
      const sorted = [...nodes].sort((a, b) => a.r - b.r);
      for (const n of sorted) {
        const np = pos(n);
        const p = worldToScreen(np.x, np.y);
        const r = Math.max(1.2, n.r * viewRef.current.k);
        const isSelected = n.id === selectedRef.current;
        const dim = activeCluster ? n.raw.clusterId !== activeCluster && !isSelected : false;
        const alpha = dim ? 0.16 : 1;
        const hasCluster = !!n.raw.clusterId;

        if (!dim && (isSelected || hasCluster)) {
          ctx.save();
          ctx.shadowColor = `rgba(${n.color}, 0.9)`;
          ctx.shadowBlur = isSelected ? 24 : hasCluster ? 13 : 6;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${n.color}, ${0.16 * alpha})`;
          ctx.fill();
          ctx.restore();
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${n.color}, ${(n.raw.isPool ? 0.5 : hasCluster ? 0.34 : 0.22) * alpha})`;
        ctx.fill();
        ctx.lineWidth = isSelected ? 2.5 : 1.3;
        ctx.strokeStyle = `rgba(${n.color}, ${(isSelected ? 1 : 0.85) * alpha})`;
        ctx.stroke();

        if (r > 12 && !dim) {
          ctx.fillStyle = `rgba(244,245,247,${alpha})`;
          ctx.font = `${n.raw.isPool ? "600 " : "500 "}${Math.min(12, r * 0.4)}px "Geist Mono", monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const label =
            n.raw.role === "liquidity"
              ? "POOL"
              : n.raw.role === "burn"
                ? "BURN"
                : n.raw.role === "deployer"
                  ? "DEV"
                  : shortAddr(n.raw.address);
          ctx.fillText(label, p.x, p.y);
        }
      }

      const hn = hoverRef.current;
      if (hn) {
        const hp = pos(hn);
        const p = worldToScreen(hp.x, hp.y);
        const r = Math.max(1.2, hn.r * viewRef.current.k);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(244,245,247,0.9)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    };

    let raf = 0;
    const loop = (now: number) => {
      const tw = viewTweenRef.current;
      if (tw) {
        const p = Math.min(1, (now - tw.t0) / tw.dur);
        const e = 1 - (1 - p) * (1 - p) * (1 - p); // ease-out cubic
        viewRef.current = {
          x: tw.from.x + (tw.to.x - tw.from.x) * e,
          y: tw.from.y + (tw.to.y - tw.from.y) * e,
          k: tw.from.k + (tw.to.k - tw.from.k) * e,
        };
        if (p >= 1) viewTweenRef.current = null;
      }
      const settled = sim.alpha() < sim.alphaMin();
      if (settled && !fitted) fitView(false);
      draw(now / 1000, settled);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
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
      } else if (d.panning && (e.buttons & 1) === 1) {
        viewTweenRef.current = null;
        viewRef.current = {
          ...viewRef.current,
          x: viewRef.current.x + (e.clientX - d.lastX) / viewRef.current.k,
          y: viewRef.current.y + (e.clientY - d.lastY) / viewRef.current.k,
        };
        d.lastX = e.clientX;
        d.lastY = e.clientY;
        d.moved = true;
      } else {
        const hit = hitTest(sx, sy);
        hoverRef.current = hit;
        setHoverInfo(hit ? { node: hit, x: sx, y: sy } : null);
        canvas.style.cursor = hit ? "pointer" : "grab";
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
      viewTweenRef.current = null;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const before = screenToWorld(sx, sy);
      const factor = Math.exp(-e.deltaY * 0.0012);
      viewRef.current.k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, viewRef.current.k * factor));
      const after = screenToWorld(sx, sy);
      viewRef.current.x += after.x - before.x;
      viewRef.current.y += after.y - before.y;
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
  }, [tokenAddress, dataNodes, dataEdges, clusterIndex, clusterOrder.length]);

  const zoomBy = (factor: number) => {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, viewRef.current.k * factor));
    viewTweenRef.current = { from: { ...viewRef.current }, to: { ...viewRef.current, k: next }, t0: performance.now(), dur: 200 };
  };

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
            {hoverInfo.node.raw.isPool ? "Liquidity pool" : shortAddr(hoverInfo.node.raw.address)}
          </p>
          <p className="tabular mt-0.5 text-ink-muted">{hoverInfo.node.raw.pct.toFixed(3)}% of supply</p>
          {hoverInfo.node.raw.clusterId && (
            <p className="mt-0.5 text-ink-faint">cluster · {shortAddr(hoverInfo.node.raw.clusterId)}</p>
          )}
        </div>
      )}

      {/* zoom controls */}
      <div className="absolute bottom-3 right-3 z-10 flex flex-col overflow-hidden rounded-lg border border-line bg-surface/80 backdrop-blur-md">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => zoomBy(1.4)}
          className="grid size-8 place-items-center text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
        >
          <Plus className="size-3.5" />
        </button>
        <div className="h-px bg-line" />
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => zoomBy(1 / 1.4)}
          className="grid size-8 place-items-center text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
        >
          <Minus className="size-3.5" />
        </button>
        <div className="h-px bg-line" />
        <button
          type="button"
          aria-label="Reset view"
          onClick={() => fitRef.current()}
          className="grid size-8 place-items-center text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
        >
          <Scan className="size-3.5" />
        </button>
      </div>

      {!ready && (
        <div className="absolute inset-0 grid place-items-center bg-canvas">
          <span className="font-mono text-[12px] text-ink-faint">Laying out the graph…</span>
        </div>
      )}
    </div>
  );
}
