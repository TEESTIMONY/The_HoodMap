import type { Metadata } from "next";
import { SiteNav } from "@/components/site/site-nav";
import { Footerdemo } from "@/components/ui/footer-section";
import { ScanInput } from "@/components/site/scan-input";
import { HoodMark } from "@/components/site/logo";

export const metadata: Metadata = {
  title: "Scan a token — HoodMap",
  description:
    "Paste a Robinhood Chain contract. Holder distribution, a HoodScore grade, market stats and the live trade feed.",
};

export default function ScanPage() {
  return (
    <main className="relative min-h-[100svh] bg-canvas">
      <SiteNav />

      <section className="mx-auto flex min-h-[calc(100svh-6rem)] max-w-2xl flex-col items-center justify-center px-5 pt-24 text-center">
        <div className="relative">
          <div className="absolute inset-0 -z-10 rounded-2xl bg-lime/20 blur-xl" />
          <div className="grid size-16 place-items-center rounded-2xl border border-line-strong bg-surface-2">
            <HoodMark className="size-8" />
          </div>
        </div>

        <h1 className="mt-7 font-display text-[2.2rem] font-bold uppercase leading-none text-ink sm:text-[3rem]">
          Scan a token
        </h1>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-muted">
          Paste a Robinhood Chain contract. Holder distribution, a HoodScore grade, market stats,
          and the live trade feed.
        </p>

        <ScanInput className="mt-9 max-w-xl" />
      </section>

      <Footerdemo />
    </main>
  );
}
