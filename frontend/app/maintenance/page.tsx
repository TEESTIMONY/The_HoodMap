import type { Metadata } from "next";
import { HoodMark } from "@/components/site/logo";

export const metadata: Metadata = {
  title: "HoodMap — Temporarily offline",
  description: "HoodMap is doing some work behind the scenes. Check back soon.",
};

export default function MaintenancePage() {
  return (
    <main className="flex min-h-[100svh] flex-col items-center justify-center bg-canvas px-5 text-center">
      <div className="relative">
        <div className="absolute inset-0 -z-10 rounded-2xl bg-lime/20 blur-xl" />
        <HoodMark className="size-14" />
      </div>
      <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-lime">
        Back shortly
      </p>
      <h1 className="mt-2 font-display text-3xl font-bold text-ink sm:text-4xl">
        HoodMap is offline for a bit
      </h1>
      <p className="mt-3 max-w-md text-[14px] leading-relaxed text-ink-muted">
        We&apos;re doing some work behind the scenes. Check back soon.
      </p>
    </main>
  );
}
