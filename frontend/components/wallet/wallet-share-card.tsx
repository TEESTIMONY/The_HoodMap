"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import type { WalletSummary } from "@/lib/api";
import { monogramColor, shortAddr, toNum, usdCompact } from "@/lib/format";

const W = 1080;
const H = 1150;

const LIME = "#D6FA4D";
const ROSE = "#FB7185";
const AMBER = "#f5c451";
const MUTED = "#9aa1ae";

// Same path data as components/site/logo.tsx's HoodMark, in a 0..48 viewBox —
// redrawn here in canvas so the card carries the real mark, not a placeholder.
const RING_PATH = "M14 6.5 A 19 19 0 1 1 13 41.2";
const H_EDGES_PATH = "M16 15 V33 M32 15 V33 M16 24 H32";
const FEATHER_PATH = "M9 20 q5 4 4.5 9 q-4 -0.5 -6 -3.5 q0.6 -3.6 1.5 -5.5 Z";
const FEATHER_VEIN_PATH = "M11 21.5 q1.6 3 1.2 6.4";
const NODES: [number, number, number][] = [
  [16, 15, 2.8],
  [16, 33, 2.8],
  [32, 15, 2.8],
  [32, 33, 2.8],
  [24, 24, 3.4],
];

interface Tier {
  label: string;
  color: string;
}

function walletTier(w: WalletSummary): Tier {
  if (!w.has_trades || !w.total_trades) return { label: "NEW WALLET", color: MUTED };
  const pnl = toNum(w.total_pnl) ?? 0;
  const roi = toNum(w.roi) ?? 0;
  if (pnl > 0 && (pnl >= 5000 || roi >= 1)) return { label: "UP BIG", color: LIME };
  if (pnl > 0) return { label: "PROFITABLE", color: LIME };
  const winRate = toNum(w.win_rate);
  if (pnl === 0 || (winRate !== null && winRate >= 0.45 && winRate <= 0.55))
    return { label: "MIXED BAG", color: AMBER };
  return { label: "DOWN BAD", color: ROSE };
}

function drawHoodMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  const s = size / 48;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(s, s);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeStyle = LIME;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1.9;
  ctx.stroke(new Path2D(RING_PATH));
  ctx.globalAlpha = 1;

  ctx.lineWidth = 1.8;
  ctx.stroke(new Path2D(H_EDGES_PATH));

  for (const [nx, ny, r] of NODES) {
    ctx.beginPath();
    ctx.arc(nx, ny, r, 0, Math.PI * 2);
    ctx.fillStyle = "#06070a";
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = LIME;
    ctx.stroke();
  }

  ctx.globalAlpha = 0.9;
  ctx.fillStyle = LIME;
  ctx.fill(new Path2D(FEATHER_PATH));
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#06070a";
  ctx.lineWidth = 1;
  ctx.stroke(new Path2D(FEATHER_VEIN_PATH));
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function pnlColor(v: number | null): string {
  if (v === null) return MUTED;
  if (v > 0) return LIME;
  if (v < 0) return ROSE;
  return MUTED;
}

function signed(v: number | null): string {
  if (v === null) return "—";
  const s = usdCompact(v);
  return v > 0 ? `+${s}` : s;
}

function drawStat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  colW: number,
  value: string,
  label: string,
  color: string
): void {
  ctx.textAlign = "center";
  ctx.fillStyle = color;
  ctx.font = "700 40px 'Arial'";
  ctx.fillText(value, x + colW / 2, y);
  ctx.fillStyle = MUTED;
  ctx.font = "600 20px 'Arial'";
  ctx.save();
  ctx.letterSpacing = "2px";
  ctx.fillText(label.toUpperCase(), x + colW / 2, y + 34);
  ctx.restore();
}

function draw(canvas: HTMLCanvasElement, address: string, w: WalletSummary): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = W;
  canvas.height = H;

  // ---- background ----
  ctx.fillStyle = "#07080a";
  ctx.fillRect(0, 0, W, H);

  const glowTop = ctx.createRadialGradient(W * 0.15, H * 0.05, 0, W * 0.15, H * 0.05, W * 0.6);
  glowTop.addColorStop(0, "rgba(214,250,77,0.14)");
  glowTop.addColorStop(1, "rgba(214,250,77,0)");
  ctx.fillStyle = glowTop;
  ctx.fillRect(0, 0, W, H * 0.55);

  const glowBottom = ctx.createRadialGradient(W * 0.85, H, 0, W * 0.85, H, W * 0.7);
  glowBottom.addColorStop(0, "rgba(214,250,77,0.1)");
  glowBottom.addColorStop(1, "rgba(214,250,77,0)");
  ctx.fillStyle = glowBottom;
  ctx.fillRect(0, H * 0.4, W, H * 0.6);

  // faint grid floor across the bottom third — brand motif, kept subtle
  ctx.strokeStyle = "rgba(214,250,77,0.06)";
  ctx.lineWidth = 1;
  for (let gy = H * 0.72; gy < H; gy += 34) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(W, gy);
    ctx.stroke();
  }
  for (let gx = 0; gx <= W; gx += 60) {
    ctx.beginPath();
    ctx.moveTo(gx, H * 0.72);
    ctx.lineTo(gx, H);
    ctx.stroke();
  }

  // outer border / vignette frame
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  roundRect(ctx, 8, 8, W - 16, H - 16, 28);
  ctx.stroke();

  // ---- header wordmark ----
  drawHoodMark(ctx, W / 2 - 92, 92, 56);
  ctx.textAlign = "left";
  ctx.font = "700 40px 'Arial'";
  ctx.fillStyle = "#ffffff";
  const hoodW = ctx.measureText("Hood").width;
  ctx.fillText("Hood", W / 2 - 50, 106);
  ctx.fillStyle = LIME;
  ctx.fillText("Map", W / 2 - 50 + hoodW, 106);

  ctx.textAlign = "center";
  ctx.font = "500 20px 'Arial'";
  ctx.fillStyle = MUTED;
  ctx.fillText("Wallet Passport · Robinhood Chain", W / 2, 148);

  // ---- avatar ----
  const cx = W / 2;
  const cy = 320;
  const r = 82;
  ctx.save();
  ctx.shadowColor = "rgba(214,250,77,0.5)";
  ctx.shadowBlur = 40;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = monogramColor(address);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 64px 'Arial'";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(address.slice(2, 3).toUpperCase(), cx, cy + 4);
  ctx.textBaseline = "alphabetic";

  // address pill
  const addrText = shortAddr(address);
  ctx.font = "600 26px monospace";
  const addrW = ctx.measureText(addrText).width;
  const pillY = cy + r + 34;
  roundRect(ctx, cx - addrW / 2 - 24, pillY, addrW + 48, 48, 24);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#e8ebf0";
  ctx.textBaseline = "middle";
  ctx.fillText(addrText, cx, pillY + 25);
  ctx.textBaseline = "alphabetic";

  // tier badge
  const tier = walletTier(w);
  ctx.font = "800 24px 'Arial'";
  const tierW = ctx.measureText(tier.label).width;
  const tierY = pillY + 74;
  roundRect(ctx, cx - tierW / 2 - 26, tierY, tierW + 52, 52, 26);
  ctx.fillStyle = `${tier.color}22`;
  ctx.fill();
  ctx.strokeStyle = tier.color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = tier.color;
  ctx.textBaseline = "middle";
  ctx.save();
  ctx.letterSpacing = "1.5px";
  ctx.fillText(tier.label, cx, tierY + 27);
  ctx.restore();
  ctx.textBaseline = "alphabetic";

  // ---- big P&L number ----
  const totalPnl = toNum(w.total_pnl);
  const bigY = tierY + 170;
  ctx.save();
  ctx.shadowColor = `${pnlColor(totalPnl)}88`;
  ctx.shadowBlur = 30;
  ctx.font = "800 108px 'Arial'";
  ctx.fillStyle = pnlColor(totalPnl);
  ctx.fillText(signed(totalPnl), cx, bigY);
  ctx.restore();

  ctx.font = "600 24px 'Arial'";
  ctx.fillStyle = MUTED;
  ctx.save();
  ctx.letterSpacing = "3px";
  ctx.fillText("TOTAL P&L · REALIZED + UNREALIZED", cx, bigY + 40);
  ctx.restore();

  // ---- stat rows ----
  const rowY1 = bigY + 130;
  const rowY2 = rowY1 + 130;
  const pad = 90;
  const colW = (W - pad * 2) / 3;

  drawStat(ctx, pad, rowY1, colW, signed(toNum(w.realized_pnl)), "Realized", pnlColor(toNum(w.realized_pnl)));
  drawStat(
    ctx,
    pad + colW,
    rowY1,
    colW,
    signed(toNum(w.unrealized_pnl)),
    "Unrealized",
    pnlColor(toNum(w.unrealized_pnl))
  );
  drawStat(ctx, pad + colW * 2, rowY1, colW, usdCompact(w.total_volume), "Volume", "#e8ebf0");

  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, rowY1 + 55);
  ctx.lineTo(W - pad, rowY1 + 55);
  ctx.stroke();

  const winRate = toNum(w.win_rate);
  drawStat(
    ctx,
    pad,
    rowY2,
    colW,
    winRate === null ? "—" : `${Math.round(winRate * 100)}%`,
    "Win rate",
    "#e8ebf0"
  );
  drawStat(ctx, pad + colW, rowY2, colW, String(w.total_trades ?? 0), "Trades", "#e8ebf0");
  const roi = toNum(w.roi);
  drawStat(
    ctx,
    pad + colW * 2,
    rowY2,
    colW,
    roi === null ? "—" : `${roi > 0 ? "+" : ""}${Math.round(roi * 100)}%`,
    "ROI",
    pnlColor(roi)
  );

  // ---- footer ----
  const footY = H - 70;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.moveTo(pad, footY - 40);
  ctx.lineTo(W - pad, footY - 40);
  ctx.stroke();

  drawHoodMark(ctx, W / 2 - 130, footY, 32);
  ctx.textAlign = "left";
  ctx.font = "700 24px 'Arial'";
  ctx.fillStyle = "#ffffff";
  const fHoodW = ctx.measureText("Hood").width;
  ctx.fillText("Hood", W / 2 - 105, footY + 8);
  ctx.fillStyle = LIME;
  ctx.fillText("Map", W / 2 - 105 + fHoodW, footY + 8);
  ctx.textAlign = "center";
  ctx.font = "500 18px 'Arial'";
  ctx.fillStyle = MUTED;
  ctx.fillText("The Intelligence Layer of Robinhood Chain", W / 2, footY + 36);
}

export function WalletShareCard({ address, w }: { address: string; w: WalletSummary }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (canvasRef.current) draw(canvasRef.current, address, w);
  }, [address, w]);

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDownloading(true);
    canvas.toBlob((blob) => {
      setDownloading(false);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hoodmap-wallet-${address.slice(2, 8)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-full max-w-[380px] overflow-hidden rounded-xl border border-line shadow-2xl">
        <canvas ref={canvasRef} className="block w-full" style={{ aspectRatio: `${W} / ${H}` }} />
      </div>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="inline-flex items-center gap-2 rounded-md bg-lime px-4 py-2 font-mono text-[13px] font-semibold uppercase tracking-wide text-canvas transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        Download image
      </button>
    </div>
  );
}
