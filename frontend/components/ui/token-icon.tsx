"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { monogramColor } from "@/lib/format";

/**
 * Token avatar: tries a real icon first, falls back to the letter monogram
 * on load failure (most tokens on a memecoin-launch chain never get one).
 * DexScreener's per-token CDN is keyed by address and free to hot-link;
 * `logoUrl` (from `tokens.logo_url`, currently always empty) takes priority
 * whenever that column gets populated some other way.
 */
export function TokenIcon({
  address,
  symbol,
  logoUrl,
  className,
  textClassName = "text-[11px]",
}: {
  address: string;
  symbol?: string | null;
  logoUrl?: string | null;
  className?: string;
  textClassName?: string;
}) {
  const sym = (symbol || "?").toUpperCase();
  const src = logoUrl || `https://dd.dexscreener.com/ds-data/tokens/robinhood/${address.toLowerCase()}.png`;
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-full font-bold text-white",
          className
        )}
        style={{ backgroundColor: monogramColor(sym) }}
      >
        <span className={textClassName}>{sym.slice(0, 1)}</span>
      </span>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element -- external, address-keyed, no build-time domain to optimize
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("shrink-0 rounded-full bg-surface-3 object-cover", className)}
    />
  );
}
