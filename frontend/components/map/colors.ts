import type { WalletRole } from "@/lib/api";

/** Neutral gray-blue for anything with no detected cluster. */
export const UNCLUSTERED_RGB = "91, 100, 115";
export const POOL_RGB = "23, 176, 74"; // moss
export const BURN_RGB = "103, 110, 122"; // ink-faint

function hslToRgbString(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const r = Math.round(f(0) * 255);
  const g = Math.round(f(8) * 255);
  const b = Math.round(f(4) * 255);
  return `${r}, ${g}, ${b}`;
}

/**
 * One hue per cluster, evenly spaced around the wheel and stable for a given
 * cluster count — the same cluster index always lands on the same hue for a
 * given render of a given token (cluster order is deterministic: sorted by
 * combined supply share server-side).
 */
export function clusterColor(index: number, total: number): string {
  const hue = Math.round((360 / Math.max(total, 1)) * index) % 360;
  return hslToRgbString(hue, 72, 58);
}

export const ROLE_LABEL: Record<WalletRole, string> = {
  deployer: "Deployer",
  liquidity: "Liquidity",
  burn: "Burn",
  insider: "Insider",
  sniper: "Sniper",
  whale: "Whale",
  holder: "Holder",
};

export const ROLE_COLOR: Record<WalletRole, string> = {
  deployer: "251, 113, 133", // danger
  liquidity: POOL_RGB,
  burn: BURN_RGB,
  insider: "167, 139, 250", // violet
  sniper: "251, 191, 36", // amber
  whale: "214, 250, 77", // lime
  holder: "154, 161, 174", // ink-muted
};
