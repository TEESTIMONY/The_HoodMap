import { ShieldCheck, Waypoints } from "lucide-react";
import Link from "next/link";
import type { MapCluster, MapNode } from "@/lib/api";
import { shortAddr, tokenAmount } from "@/lib/format";
import { CopyButton } from "@/components/ui/copy-button";

export function NodeDetail({
  node,
  cluster,
  decimals,
}: {
  node: MapNode | null;
  cluster: MapCluster | null;
  decimals: number | null;
}) {
  if (!node) {
    return (
      <div className="rounded-md border border-line bg-surface/40 p-2.5">
        <p className="font-mono text-[11px] uppercase tracking-widest text-ink-faint">Selection</p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
          Click a bubble to inspect it — a cluster, a wallet, or the pool.
        </p>
      </div>
    );
  }

  const kind = node.isPool
    ? "Liquidity pool"
    : node.isBurn
      ? "Burn address"
      : node.isFunderOnly
        ? "Funding source"
        : "Wallet";

  return (
    <div className="rounded-md border border-line bg-surface/40 p-2.5">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-widest text-ink-faint">{kind}</p>
        {!node.isPool && !node.isBurn && (
          <ShieldCheck className="size-3.5 text-ink-faint" aria-hidden />
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[13px] text-ink">
        <span className="truncate">{shortAddr(node.address)}</span>
        <CopyButton value={node.address} label="address" />
      </div>

      {!node.isFunderOnly && (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <div className="rounded border border-line bg-canvas px-2 py-1.5">
            <p className="tabular font-mono text-[13px] text-lime">{node.pct.toFixed(3)}%</p>
            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-ink-faint">
              Of supply
            </p>
          </div>
          <div className="rounded border border-line bg-canvas px-2 py-1.5">
            <p className="tabular truncate font-mono text-[13px] text-ink">
              {tokenAmount(node.balance, decimals)}
            </p>
            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-ink-faint">
              Balance
            </p>
          </div>
        </div>
      )}

      {node.funder && (
        <p className="mt-2 text-[12px] leading-snug text-ink-muted">
          Funded by <span className="font-mono text-ink">{shortAddr(node.funder)}</span> —{" "}
          {node.funderKind === "token" ? "sent the token directly" : "sent its first native transfer"}.
        </p>
      )}

      {cluster && (
        <div className="mt-2.5 border-t border-line pt-2.5">
          <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
            Cluster · {cluster.memberCount} wallets · {cluster.totalPct.toFixed(2)}% combined
          </p>
          <ul className="mt-1.5 max-h-32 space-y-1 overflow-y-auto">
            {cluster.members.map((m) => (
              <li key={m} className="flex items-center gap-1.5 font-mono text-[11px] text-ink-muted">
                <span className="truncate">{shortAddr(m)}</span>
                <CopyButton value={m} label="address" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {!node.isPool && !node.isFunderOnly && (
        <Link
          href={`/wallet/${node.address}`}
          className="mt-2.5 inline-flex items-center gap-1.5 font-mono text-[12px] text-ink-muted transition-colors hover:text-lime"
        >
          <Waypoints className="size-3.5" />
          Open Wallet Passport
        </Link>
      )}
    </div>
  );
}
