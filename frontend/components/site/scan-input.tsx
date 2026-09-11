"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const ADDR = /^0x[0-9a-fA-F]{40}$/;

/**
 * "Paste a contract. See the wallets." — the primary entry point.
 * Lead with the instruction, not the pitch (brand voice).
 */
export function ScanInput({
  className,
  hideHint = false,
}: {
  className?: string;
  hideHint?: boolean;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!ADDR.test(v)) {
      setError("That doesn't look like an address. Paste a token contract or a wallet (0x…, 42 chars).");
      return;
    }
    setError(null);
    // Router wiring lands with the app routes; for now, park it.
    window.location.href = `/scan/${v.toLowerCase()}`;
  };

  return (
    <div className={cn("w-full max-w-xl", className)}>
      <form
        onSubmit={submit}
        className={cn(
          "group flex items-center gap-2 rounded-full border bg-surface/80 p-2 pl-4 backdrop-blur-md transition-colors",
          error ? "border-danger/50" : "border-line-strong focus-within:border-lime/50"
        )}
      >
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          spellCheck={false}
          autoComplete="off"
          placeholder="Paste a Robinhood Chain contract or wallet (0x…)"
          className="min-w-0 flex-1 bg-transparent px-2 py-3 text-[13px] leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none"
        />
        <button
          type="submit"
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-lime px-5 py-2.5 font-mono text-[13px] font-semibold text-canvas transition-shadow hover:shadow-glow-lime-sm"
        >
          Scan
          <ArrowRight className="size-4" />
        </button>
      </form>
      {(error || !hideHint) && (
        <p
          className={cn(
            "mt-3 min-h-[1rem] px-4 text-[13px] leading-relaxed",
            error ? "text-danger" : "text-ink-faint"
          )}
        >
          {error ?? "Raw on-chain history, no login."}
        </p>
      )}
    </div>
  );
}
