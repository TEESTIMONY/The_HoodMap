import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WalletTransaction } from "@/lib/api";
import { shortAddr, since, tokenAmount } from "@/lib/format";
import { CopyButton } from "@/components/ui/copy-button";
import { DIVIDER, EXPLORER_TX } from "./table-shared";

export function TransactionsTable({
  wallet,
  transactions,
  loading,
  expanded = false,
}: {
  wallet: string;
  transactions: WalletTransaction[];
  loading: boolean;
  expanded?: boolean;
}) {
  if (!loading && transactions.length === 0) {
    return (
      <p className="px-1 py-12 text-center text-[13px] text-ink-faint">
        No transactions found in the indexed range.
      </p>
    );
  }

  const table = (
    <table className="w-full min-w-[640px] border-collapse text-sm">
      <thead>
        <tr className="sticky top-0 z-10 border-b border-line-strong text-left text-[11px] uppercase tracking-wide text-ink-faint">
          <th className="bg-surface px-2 py-1.5 font-medium">Age</th>
          {["Direction", "From", "To", "Value", "Status"].map((h) => (
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
                {Array.from({ length: 6 }).map((__, j) => (
                  <td key={j} className={cn("px-2 py-2", j === 5 && "px-4")}>
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
          : transactions.map((tx) => {
              const outgoing = tx.from_address.toLowerCase() === wallet.toLowerCase();
              return (
                <tr
                  key={tx.hash}
                  className="divide-x divide-line-strong border-b border-line-strong transition last:border-b-0 hover:bg-white/[0.02]"
                >
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[12px] text-ink-faint">
                    {since(tx.timestamp)} ago
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                        outgoing ? "bg-danger/10 text-danger" : "bg-success/10 text-success"
                      )}
                    >
                      {outgoing ? "out" : "in"}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-[12px] text-ink-muted">
                    <span className="inline-flex items-center gap-1">
                      {shortAddr(tx.from_address)}
                      <CopyButton value={tx.from_address} label="address" />
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-[12px] text-ink-muted">
                    {tx.to_address ? (
                      <span className="inline-flex items-center gap-1">
                        {shortAddr(tx.to_address)}
                        <CopyButton value={tx.to_address} label="address" />
                      </span>
                    ) : (
                      <span className="italic text-ink-faint">contract creation</span>
                    )}
                  </td>
                  <td className="tabular px-2 py-1.5 text-right font-mono text-[12px] text-ink">
                    {tokenAmount(tx.value, 18)}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                        tx.status === 0
                          ? "bg-danger/10 text-danger"
                          : "bg-white/[0.05] text-ink-faint"
                      )}
                    >
                      {tx.status === 0 ? "failed" : "ok"}
                    </span>
                  </td>
                  <td className="px-4 py-1.5 text-right">
                    <a
                      href={EXPLORER_TX + tx.hash}
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

  return (
    <div className="max-h-[300px] overflow-auto lg:max-h-none lg:overflow-visible">{table}</div>
  );
}
