import { ArrowDownRight, ArrowUpRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TokenSwap } from "@/lib/api";
import { priceUsd, shortAddr, since, toNum, tokenAmount, usdCompact } from "@/lib/format";

const EXPLORER_TX = "https://explorer.mainnet.chain.robinhood.com/tx/";

const SIDE_BADGE: Record<TokenSwap["side"], string> = {
  buy: "text-success bg-success/10",
  sell: "text-danger bg-danger/10",
};
const SIDE_ICON = { buy: ArrowUpRight, sell: ArrowDownRight } as const;
const AMOUNT_COLOR: Record<TokenSwap["side"], string> = {
  buy: "text-success",
  sell: "text-danger",
};

// A swap moves the token pool <-> maker. On a buy the token leaves the pool for
// the maker; on a sell it goes the other way. That orientation is the closest
// thing we have to the transfer's from / to.
function legs(s: TokenSwap): { from: string; to: string } {
  return s.side === "buy"
    ? { from: s.pool_address, to: s.wallet_address }
    : { from: s.wallet_address, to: s.pool_address };
}

// Effective per-token price for this fill: trade USD / tokens moved.
function fillPrice(s: TokenSwap, decimals: number | null): number | null {
  const usd = toNum(s.usd_value);
  const raw = toNum(s.token_amount);
  if (usd === null || !raw) return null;
  const tokens = raw / 10 ** (decimals ?? 18);
  return tokens ? usd / tokens : null;
}

const DIVIDER = "shadow-[inset_1px_0_0_rgba(255,255,255,0.16)]";

export function TxFeed({
  swaps,
  decimals,
  loading,
  expanded = false,
}: {
  swaps: TokenSwap[];
  decimals: number | null;
  loading: boolean;
  /** rendered inside a modal that owns the panel chrome + its own scroll */
  expanded?: boolean;
}) {
  if (!loading && swaps.length === 0) {
    return (
      <p className="px-1 py-12 text-center text-[13px] text-ink-faint">
        No trades indexed for this token yet.
      </p>
    );
  }

  const table = (
    // min-w keeps columns from squashing on narrow screens — it scrolls instead
    <table className="w-full min-w-[720px] border-collapse text-sm">
      <thead>
        <tr className="sticky top-0 z-10 border-b border-line-strong text-left text-[11px] uppercase tracking-wide text-ink-faint">
          <th className="bg-surface px-2 py-1.5 font-medium">Age</th>
          {["Type", "Amount", "Price", "USD", "From", "To"].map((h) => (
            <th key={h} className={cn("bg-surface px-2 py-1.5 text-right font-medium", DIVIDER)}>
              {h}
            </th>
          ))}
          <th className={cn("bg-surface px-4 py-1.5 text-right font-medium", DIVIDER)}>Txn</th>
        </tr>
      </thead>
      <tbody>
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="divide-x divide-line-strong border-b border-line-strong">
                {Array.from({ length: 8 }).map((__, j) => (
                  <td key={j} className={cn("px-2 py-2", j === 7 && "px-4")}>
                    <span
                      className={cn(
                        "block h-3 animate-pulse rounded bg-surface-3",
                        j === 0 ? "w-12" : "ml-auto w-14"
                      )}
                    />
                  </td>
                ))}
              </tr>
            ))
          : swaps.map((s) => {
              const { from, to } = legs(s);
              const Icon = SIDE_ICON[s.side];
              return (
                <tr
                  key={`${s.transaction_hash}-${s.log_index}`}
                  className="divide-x divide-line-strong border-b border-line-strong transition last:border-b-0 hover:bg-white/[0.02]"
                >
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[12px] text-ink-faint">
                    {since(s.timestamp)} ago
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                        SIDE_BADGE[s.side]
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {s.side}
                    </span>
                  </td>
                  <td
                    className={cn(
                      "tabular px-2 py-1.5 text-right font-mono text-[12px]",
                      AMOUNT_COLOR[s.side]
                    )}
                  >
                    {tokenAmount(s.token_amount, decimals)}
                  </td>
                  <td className="tabular whitespace-nowrap px-2 py-1.5 text-right font-mono text-[12px] text-ink">
                    {priceUsd(fillPrice(s, decimals))}
                  </td>
                  <td className="tabular px-2 py-1.5 text-right font-mono text-[12px] text-ink-muted">
                    {usdCompact(s.usd_value)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-[12px] text-ink-muted">
                    {shortAddr(from)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-[12px] text-ink-muted">
                    {shortAddr(to)}
                  </td>
                  <td className="px-4 py-1.5 text-right">
                    <a
                      href={EXPLORER_TX + s.transaction_hash}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="View transaction on the block explorer"
                      className="inline-flex text-ink-faint transition hover:text-lime-soft"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </td>
                </tr>
              );
            })}
      </tbody>
    </table>
  );

  if (expanded) return <div className="overflow-x-auto">{table}</div>;

  // mobile: cap at ~6 rows and scroll inside this box.
  // lg: the pinned layout's panel is the scroll owner, so let content flow.
  return (
    <div className="max-h-[300px] overflow-auto lg:max-h-none lg:overflow-visible">{table}</div>
  );
}
