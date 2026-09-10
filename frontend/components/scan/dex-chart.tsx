"use client";

import { useState } from "react";
import type { ReportPool } from "@/lib/api";

/**
 * DexScreener's embeddable candlestick chart for the deepest priced pool.
 * V4 pools use a 32-byte PoolId that DexScreener can't address, so prefer a
 * 20-byte (V2/V3) pool.
 */
export function DexChart({ pools }: { pools: ReportPool[] }) {
  const [loaded, setLoaded] = useState(false);
  const pool = pools.find((p) => p.address.length === 42) ?? pools[0];

  if (!pool) {
    return (
      <div className="grid h-[280px] place-items-center rounded-md border border-line bg-surface/40 text-[13px] text-ink-muted">
        No indexed pool to chart.
      </div>
    );
  }

  const src =
    `https://dexscreener.com/robinhood/${pool.address}` +
    `?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0` +
    `&theme=dark&chartTheme=dark&chartStyle=1&interval=15`;

  return (
    <div className="relative overflow-hidden rounded-md border border-line bg-surface/40">
      {!loaded && (
        <div className="absolute inset-0 z-10 grid place-items-center font-mono text-[12px] text-ink-faint">
          Loading chart…
        </div>
      )}
      <iframe
        src={src}
        title="Price chart"
        onLoad={() => setLoaded(true)}
        loading="lazy"
        className="h-[300px] w-full border-0 sm:h-[340px] lg:h-[clamp(220px,38vh,360px)]"
      />
    </div>
  );
}
