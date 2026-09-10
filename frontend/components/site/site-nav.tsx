"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronDown,
  Flame,
  Menu,
  Radar,
  Wallet,
  Waypoints,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { HoodWordmark } from "@/components/site/logo";

const PRODUCTS = [
  { icon: Radar, name: "Scan", href: "/scan", blurb: "Holder map · clusters · HoodScore" },
  { icon: Waypoints, name: "HoodMap view", href: "/map", blurb: "Bubble map of every holder" },
  { icon: Wallet, name: "Wallet Passport", href: "/wallet", blurb: "Reconstructed P&L, any wallet" },
  { icon: Flame, name: "Top Memecoins", href: "/trending", blurb: "What's trending on the chain" },
];

const LINKS = [
  { label: "Trending", href: "/trending" },
  { label: "Docs", href: "/docs" },
];

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div
        className={cn(
          "relative z-50 mx-auto grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 transition-all duration-300 sm:px-6",
          scrolled
            ? "mt-3 max-w-5xl rounded-2xl border border-line-strong bg-canvas/90 py-2.5 shadow-[0_24px_70px_-28px_rgba(0,0,0,0.95)] backdrop-blur-xl"
            : "mt-0 max-w-6xl border border-transparent py-4"
        )}
      >
        <Link href="/" aria-label="HoodMap home" className="justify-self-start">
          <HoodWordmark />
        </Link>

        {/* desktop nav */}
        <nav className="col-start-2 hidden items-center gap-0.5 font-mono text-[14px] text-ink-muted md:flex">
          <div
            className="relative"
            onMouseEnter={() => setProductsOpen(true)}
            onMouseLeave={() => setProductsOpen(false)}
          >
            <button
              type="button"
              aria-expanded={productsOpen}
              onClick={() => setProductsOpen((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1 rounded-lg px-3 py-2 transition-colors hover:bg-surface-3 hover:text-ink",
                productsOpen && "bg-surface-3 text-ink"
              )}
            >
              Products
              <ChevronDown
                className={cn("size-3.5 transition-transform", productsOpen && "rotate-180")}
              />
            </button>
            {productsOpen && (
              <div className="absolute left-1/2 top-full w-[520px] -translate-x-1/2 pt-3">
                <div className="grid grid-cols-2 gap-1 rounded-2xl border border-line-strong bg-surface-2/95 p-2 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95)] backdrop-blur-xl">
                  {PRODUCTS.map((p) => (
                    <Link
                      key={p.name}
                      href={p.href}
                      className="group flex gap-3 rounded-xl p-3 transition-colors hover:bg-surface-3"
                    >
                      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface text-lime transition-shadow group-hover:shadow-glow-lime-sm">
                        <p.icon className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-ink">
                          {p.name}
                        </span>
                        <span className="mt-0.5 block text-[12px] leading-snug text-ink-faint">
                          {p.blurb}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-2 transition-colors hover:bg-surface-3 hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* right cluster */}
        <div className="col-start-3 flex items-center justify-self-end gap-2">
          <span className="hidden items-center gap-2 rounded-full border border-line px-3 py-1.5 font-mono text-[12px] text-ink-muted lg:inline-flex">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-moss opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-moss" />
            </span>
            RH Chain
          </span>
          <Link
            href="/scan"
            className="hidden rounded-xl border border-line-strong bg-surface/70 px-4 py-2 font-mono text-[14px] text-ink-muted backdrop-blur-md transition-colors hover:text-ink sm:inline-flex"
          >
            Login
          </Link>
          <Link
            href="/scan"
            className="inline-flex items-center gap-1.5 rounded-xl bg-lime px-4 py-2 font-mono text-[14px] font-semibold text-canvas transition-shadow hover:shadow-glow-lime-sm"
          >
            Launch
            <ArrowUpRight className="size-[18px]" />
          </Link>
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex size-10 items-center justify-center rounded-xl border border-line-strong bg-surface/70 text-ink backdrop-blur-md md:hidden"
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* mobile panel */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 bg-canvas/95 backdrop-blur-xl md:hidden">
          <div className="flex h-full flex-col gap-1 overflow-y-auto px-5 pb-12 pt-24">
            <p className="px-3 pb-1 pt-2 font-mono text-[11px] uppercase tracking-widest text-ink-faint">
              Products
            </p>
            {PRODUCTS.map((p) => (
              <Link
                key={p.name}
                href={p.href}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-surface-2"
              >
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface-2 text-lime">
                  <p.icon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-ink">{p.name}</span>
                  <span className="block text-[13px] leading-snug text-ink-faint">{p.blurb}</span>
                </span>
              </Link>
            ))}
            <p className="px-3 pb-1 pt-5 font-mono text-[11px] uppercase tracking-widest text-ink-faint">
              More
            </p>
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-xl px-3 py-3 text-[16px] text-ink transition-colors hover:bg-surface-2"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-5 flex flex-col gap-2 px-3">
              <Link
                href="/scan"
                onClick={() => setMenuOpen(false)}
                className="rounded-xl border border-line-strong bg-surface/70 py-3 text-center font-mono text-[15px] text-ink"
              >
                Login
              </Link>
              <Link
                href="/scan"
                onClick={() => setMenuOpen(false)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-lime py-3 font-mono text-[15px] font-semibold text-canvas"
              >
                Launch app
                <ArrowUpRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
