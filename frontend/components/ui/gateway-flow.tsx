"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Gateway Flow — dashed bezier strands stream from the left and right edges and
 * converge on a centre point, with travelling particles and click shockwaves.
 * Native canvas port of a 21st.dev component, recoloured for HoodMap
 * (lime on near-black) and given concentric convergence rings.
 */

export interface GatewayFlowProps {
  className?: string;
  /** particle / strand speed multiplier */
  speed?: number;
  /** number of strands (scaled by density) */
  density?: number;
  strokeWidth?: number;
  opacity?: number;
  /** convergence point as viewport ratios */
  convergeX?: number;
  convergeY?: number;
  /** draw concentric rings at the convergence point */
  rings?: boolean;
}

const LIME = "214, 250, 77";
const BG = "#06070a";

interface Strand {
  isLeft: boolean;
  startY: number;
  t: number;
  pSpeed: number;
}

interface Shock {
  x: number;
  y: number;
  radius: number;
  life: number;
}

export function GatewayFlow({
  className,
  speed = 1,
  density = 1,
  strokeWidth = 1,
  opacity = 1,
  convergeX = 0.5,
  convergeY = 0.52,
  rings = true,
}: GatewayFlowProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let strands: Strand[] = [];
    let shocks: Shock[] = [];
    let raf = 0;

    const buildStrands = () => {
      const n = Math.max(12, Math.round(80 * density));
      strands = Array.from({ length: n }, (_, i) => ({
        isLeft: i % 2 === 0,
        startY: (i / n) * height * 1.4 - height * 0.2,
        t: Math.random(),
        pSpeed: 0.0015 + Math.random() * 0.002,
      }));
    };

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      buildStrands();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    const onClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      shocks.push({ x: e.clientX - rect.left, y: e.clientY - rect.top, radius: 0, life: 1 });
    };
    container.addEventListener("click", onClick);

    const bezier = (
      t: number,
      p0: { x: number; y: number },
      p1: { x: number; y: number },
      p2: { x: number; y: number },
      p3: { x: number; y: number }
    ) => {
      const u = 1 - t;
      return {
        x: u ** 3 * p0.x + 3 * u ** 2 * t * p1.x + 3 * u * t ** 2 * p2.x + t ** 3 * p3.x,
        y: u ** 3 * p0.y + 3 * u ** 2 * t * p1.y + 3 * u * t ** 2 * p2.y + t ** 3 * p3.y,
      };
    };

    const render = () => {
      const cx = width * convergeX;
      const cy = height * convergeY;

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, width, height);

      for (let i = shocks.length - 1; i >= 0; i--) {
        shocks[i].radius += 15;
        shocks[i].life -= 0.015;
        if (shocks[i].life <= 0) shocks.splice(i, 1);
      }

      // concentric convergence rings
      if (rings) {
        for (let r = 0; r < 6; r++) {
          const rad = 54 + r * 82;
          ctx.strokeStyle = `rgba(${LIME}, ${(0.16 - r * 0.02) * opacity})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rad * 1.75, rad, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      for (const s of strands) {
        const p0 = { x: s.isLeft ? 0 : width, y: s.startY };
        const p1 = { x: s.isLeft ? cx * 0.5 : width - cx * 0.5, y: s.startY };
        const p2 = { x: s.isLeft ? cx * 0.8 : width - cx * 0.8, y: cy };
        const p3 = { x: cx, y: cy };

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
        ctx.strokeStyle = `rgba(${LIME}, ${0.3 * opacity})`;
        ctx.lineWidth = 1.1 * strokeWidth;
        ctx.setLineDash([1, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        if (!reduceMotion) {
          s.t += s.pSpeed * speed;
          if (s.t > 1) {
            s.t = 0;
            s.startY += (Math.random() - 0.5) * 10;
          }
        }

        const pos = bezier(s.t, p0, p1, p2, p3);
        let dx = 0;
        let dy = 0;
        for (const shock of shocks) {
          const ddx = pos.x - shock.x;
          const ddy = pos.y - shock.y;
          const dist = Math.hypot(ddx, ddy) || 1;
          if (dist < shock.radius + 120 && dist > shock.radius - 120) {
            const force = (1 - Math.abs(dist - shock.radius) / 120) * shock.life;
            dx += (ddx / dist) * force * 80;
            dy += (ddy / dist) * force * 80;
          }
        }
        pos.x += dx;
        pos.y += dy;

        const near = 1 - Math.min(1, Math.hypot(pos.x - cx, pos.y - cy) / (width * 0.5));
        ctx.fillStyle = `rgba(${LIME}, ${(0.55 + near * 0.4) * opacity})`;
        ctx.shadowColor = `rgba(${LIME}, ${0.7 * opacity})`;
        ctx.shadowBlur = 6 + near * 6;
        ctx.fillRect(pos.x - 1.5, pos.y - 1.5, 3, 3);
        ctx.shadowBlur = 0;
      }

      // convergence glow
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90);
      glow.addColorStop(0, `rgba(${LIME}, ${0.16 * opacity})`);
      glow.addColorStop(1, "rgba(214,250,77,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, 90, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      container.removeEventListener("click", onClick);
    };
  }, [speed, density, strokeWidth, opacity, convergeX, convergeY, rings]);

  return (
    <div ref={containerRef} className={cn("relative overflow-hidden bg-canvas", className)}>
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
    </div>
  );
}

export default GatewayFlow;
