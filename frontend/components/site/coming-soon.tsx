import { SiteNav } from "@/components/site/site-nav";
import { Footerdemo } from "@/components/ui/footer-section";
import { HoodMark } from "@/components/site/logo";

/**
 * Shared placeholder for nav-linked pages that don't have real content yet
 * (Docs, Pricing, Whitepaper) — keeps those links resolving instead of
 * 404ing while the actual pages get written.
 */
export function ComingSoon({ eyebrow, title, blurb }: { eyebrow: string; title: string; blurb: string }) {
  return (
    <main className="relative flex min-h-[100svh] flex-col bg-canvas">
      <SiteNav />

      <section className="mx-auto flex flex-1 max-w-xl flex-col items-center justify-center px-5 pt-24 text-center">
        <div className="relative">
          <div className="absolute inset-0 -z-10 rounded-2xl bg-lime/20 blur-xl" />
          <HoodMark className="size-12" />
        </div>
        <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-lime">{eyebrow}</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-ink">{title}</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">{blurb}</p>
      </section>

      <Footerdemo />
    </main>
  );
}
