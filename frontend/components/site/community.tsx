import { Send } from "lucide-react";
import { HoodMark } from "@/components/site/logo";
import { HexField } from "@/components/site/hex-field";
import { XIcon } from "@/components/site/x-icon";

/**
 * Closing "join us" beat over a drifting hash field, echoing the reference:
 * the mark on a glowing tile, a short line, and the two places the
 * conversation actually happens.
 */
export function Community() {
  return (
    <section className="relative overflow-hidden py-24 sm:py-28">
      <HexField />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[380px] w-[680px] max-w-[110%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-moss/12 blur-[120px]" />

      <div className="relative z-10 mx-auto flex max-w-xl flex-col items-center px-5 text-center">
        <div className="relative">
          <div className="absolute inset-0 -z-10 rounded-2xl bg-lime/25 blur-xl" />
          <div className="grid size-16 place-items-center rounded-2xl border border-line-strong bg-surface-2">
            <HoodMark className="size-8" />
          </div>
        </div>

        <h2 className="mt-7 font-display text-[2.4rem] font-normal leading-[1.05] text-ink [text-shadow:0_0_36px_rgba(23,176,74,0.3)] sm:text-[3.25rem]">
          Join our communities
        </h2>
        <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-ink-muted sm:text-lg">
          New clusters, HoodScore changes, and whales on the move, called out as they happen.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <a
            href="https://x.com/hoodmaptech"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2.5 rounded-full border border-line-strong bg-surface/60 px-5 py-3 font-mono text-[14px] text-ink backdrop-blur-md transition-colors hover:border-lime/40 hover:text-lime"
          >
            <XIcon className="size-[15px]" />
            Follow on X
          </a>
          <a
            href="https://t.me/hoodmaptech"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2.5 rounded-full border border-line-strong bg-surface/60 px-5 py-3 font-mono text-[14px] text-ink backdrop-blur-md transition-colors hover:border-lime/40 hover:text-lime"
          >
            <Send className="size-4" strokeWidth={1.75} />
            Join Telegram
          </a>
        </div>
      </div>
    </section>
  );
}
