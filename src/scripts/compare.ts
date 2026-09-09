/**
 * `npm run compare -- 0x<token>` — diff our token_statistics against
 * Dexscreener's public API for the same token. A calibration aid, not part of
 * the product (Dexscreener is a third party; see the ToS note in the README).
 */
import { pool } from "../db/pool.js";
import { config } from "../config/index.js";
import { computeTokenStats } from "../analytics/statistics.js";
import { normalizeAddress } from "../lib/address.js";

const raw = process.argv[2];
if (!raw || !/^0x[0-9a-fA-F]{40}$/.test(raw)) {
  console.error("usage: npm run compare -- 0x<tokenAddress>");
  process.exit(1);
}
const address = normalizeAddress(raw);

function pct(ours: number | null, theirs: number | null): string {
  if (ours == null || theirs == null || theirs === 0) return "—";
  const d = ((ours - theirs) / theirs) * 100;
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
}
const n = (v: unknown): number | null => (v == null ? null : Number(v));

async function main(): Promise<void> {
  await computeTokenStats(address).catch(() => undefined);
  const { rows } = await pool.query(
    `SELECT t.symbol, ts.* FROM token_statistics ts
       JOIN tokens t ON t.address = ts.token_address AND t.chain_id = ts.chain_id
      WHERE ts.chain_id = $1 AND ts.token_address = $2`,
    [config.CHAIN_ID, address]
  );
  const ours = rows[0];

  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
  const ds = (await res.json()) as { pairs?: Array<Record<string, unknown>> };
  const pairs = (ds.pairs ?? []).filter(
    (p) => (p.baseToken as { address: string }).address.toLowerCase() === address
  );
  // Dexscreener's headline = deepest pair.
  pairs.sort((a, b) => n((b.liquidity as { usd: number })?.usd) ?? 0 - (n((a.liquidity as { usd: number })?.usd) ?? 0));
  const top = pairs[0];

  console.log(`\n${ours?.symbol ?? "?"}  ${address}\n`);
  if (!ours) {
    console.log("  (not in token_statistics — no pools, or not discovered)");
  }
  const dsPrice = top ? n(top.priceUsd) : null;
  const dsLiq = pairs.reduce((s, p) => s + (n((p.liquidity as { usd: number })?.usd) ?? 0), 0) || null;
  const dsFdv = top ? n(top.fdv) : null;
  const dsVol = pairs.reduce((s, p) => s + (n((p.volume as { h24: number })?.h24) ?? 0), 0) || null;

  const table = [
    ["price USD", n(ours?.price), dsPrice],
    ["FDV", n(ours?.fdv), dsFdv],
    ["liquidity USD", n(ours?.liquidity_usd), dsLiq],
    ["volume 24h", n(ours?.volume_24h), dsVol],
  ];
  console.log("  metric           ours            dexscreener      Δ");
  for (const [label, o, t] of table) {
    console.log(
      `  ${String(label).padEnd(15)} ${String(o ?? "—").padEnd(15)} ${String(t ?? "—").padEnd(15)} ${pct(o as number, t as number)}`
    );
  }
  const dsVenues = new Set(pairs.flatMap((p) => (p.labels as string[]) ?? []));
  console.log(
    `\n  our pools: ${ours?.pool_count ?? 0}   dexscreener pairs: ${pairs.length}` +
      (dsVenues.size ? `   (${[...dsVenues].join(", ")})` : "")
  );
  console.log(
    `  gap is usually pool coverage — run 'npm run backfill:pools' to completion,`
  );
  console.log(`  and keep the indexer running for volume.`);
  console.log(`  our confidence: ${ours?.price_confidence ?? "—"}\n`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
