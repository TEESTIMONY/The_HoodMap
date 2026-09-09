"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const ADDR = /^0x[0-9a-fA-F]{40}$/;

/**
 * "Paste a contract. See the wallets." — the primary entry point.
 * Lead with the instruction, not the pitch (brand voice).
 */
export function ScanInput({ className }: { className?: string }) {
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
          "group flex items-center gap-2 rounded-2xl border bg-surface/80 p-2 backdrop-blur-md transition-colors",
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
          className="tabular min-w-0 flex-1 bg-transparent px-3 py-3.5 font-mono text-[16px] text-ink placeholder:text-ink-faint focus:outline-none"
        />
        <button
          type="submit"
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-lime px-5 py-3.5 font-mono text-[15px] font-semibold uppercase tracking-wide text-canvas transition-shadow hover:shadow-glow-lime-sm"
        >
          Scan
          <ArrowRight className="size-[18px]" />
        </button>
      </form>
      <p
        className={cn(
          "mt-3 min-h-[1.25rem] px-1 font-mono text-[13px]",
          error ? "text-danger" : "text-ink-faint"
        )}
      >
        {error ?? "Reads raw transfer history straight from the chain — no login."}
      </p>
    </div>
  );
}
