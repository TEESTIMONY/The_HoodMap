import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TokenSwap } from "@/lib/api";
import { shortAddr, since, tokenAmount, usdCompact } from "@/lib/format";
import { CopyButton } from "@/components/ui/copy-button";

const COLS = "grid-cols-[56px_58px_minmax(84px,1fr)_minmax(74px,0.9fr)_minmax(116px,1.1fr)_34px]";

export function TxFeed({
  swaps,
  decimals,
  loading,
}: {
  swaps: TokenSwap[];
  decimals: number | null;
  loading: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        <div
          className={cn(
            "grid border-b border-line-strong px-1 py-2.5 font-mono text-[10px] uppercase tracking-widest text-ink-faint",
            COLS
          )}
        >
          <div>Age</div>
          <div>Type</div>
          <div className="text-right">Amount</div>
          <div className="text-right">USD</div>
          <div className="text-right">Wallet</div>
          <div />
        </div>

        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={cn("grid items-center border-b border-line px-1 py-3.5", COLS)}>
              <span className="block h-3 w-9 animate-pulse rounded bg-surface-3" />
              <span className="block h-3 w-9 animate-pulse rounded bg-surface-3" />
              {Array.from({ length: 3 }).map((_, j) => (
                <span key={j} className="ml-auto block h-3 w-12 animate-pulse rounded bg-surface-3" />
              ))}
              <span />
            </div>
          ))
        ) : swaps.length === 0 ? (
          <p className="px-1 py-12 text-center text-[13px] text-ink-muted">
            No trades indexed for this token yet.
          </p>
        ) : (
          swaps.map((s) => (
            <div
              key={s.transaction_hash + s.log_index}
              className={cn(
                "grid items-center border-b border-line px-1 py-3.5 text-[12px] last:border-0",
                COLS
              )}
            >
              <div className="font-mono text-ink-faint">{since(s.timestamp)}</div>
              <div>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 font-mono text-[10px] uppercase",
                    s.side === "buy" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                  )}
                >
                  {s.side}
                </span>
              </div>
              <div className="tabular text-right font-mono text-ink">
                {tokenAmount(s.token_amount, decimals)}
              </div>
              <div className="tabular text-right font-mono text-ink-muted">
                {usdCompact(s.usd_value)}
              </div>
              <div className="flex items-center justify-end gap-1 font-mono text-ink-muted">
                <span>{shortAddr(s.wallet_address)}</span>
                <CopyButton value={s.wallet_address} label="wallet" />
              </div>
              <a
                href={`https://blockscout.chain.robinhood.com/tx/${s.transaction_hash}`}
                target="_blank"
                rel="noreferrer"
                aria-label="View transaction"
                className="justify-self-end text-ink-faint transition-colors hover:text-lime"
              >
                <ArrowUpRight className="size-3.5" />
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
