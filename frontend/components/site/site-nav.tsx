"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  Flame,
  Globe,
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
  { label: "Home", href: "/", active: true },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Products", href: "/scan", dropdown: true },
  { label: "Pricing", href: "/pricing" },
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
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
        scrolled
          ? "border-b border-line/70 bg-canvas/80 backdrop-blur-xl"
          : "border-b border-transparent"
      )}
    >
      <div className="relative z-50 mx-auto grid w-full max-w-[1600px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
        {/* left — logo */}
        <Link href="/" aria-label="HoodMap home" className="justify-self-start">
          <HoodWordmark />
        </Link>

        {/* centre — grouped links */}
        <nav className="col-start-2 hidden items-center whitespace-nowrap rounded-full border border-line/70 bg-surface/40 p-1 font-mono text-[13px] backdrop-blur-md xl:flex">
            {LINKS.map((l) =>
              l.dropdown ? (
                <div
                  key={l.label}
                  className="relative"
                  onMouseEnter={() => setProductsOpen(true)}
                  onMouseLeave={() => setProductsOpen(false)}
                >
                  <button
                    type="button"
                    aria-expanded={productsOpen}
                    onClick={() => setProductsOpen((v) => !v)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 transition-colors hover:text-ink",
                      productsOpen ? "text-ink" : "text-ink-muted"
                    )}
                  >
                    {l.label}
                    <ChevronDown
                      className={cn("size-3.5 transition-transform", productsOpen && "rotate-180")}
                    />
                  </button>
                  {productsOpen && (
                    <div className="absolute left-1/2 top-full w-[520px] -translate-x-1/2 pt-4">
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
              ) : (
                <Link
                  key={l.label}
                  href={l.href}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 transition-colors hover:text-ink",
                    l.active ? "bg-surface-3 text-ink" : "text-ink-muted"
                  )}
                >
                  {l.label}
                </Link>
              )
            )}
            <Link
              href="/scan"
              className="ml-1 rounded-full border border-line-strong px-3.5 py-1.5 text-ink-muted transition-colors hover:text-ink"
            >
              Login / Register
            </Link>
        </nav>

        {/* right — language + CTAs */}
        <div className="col-start-3 flex items-center justify-self-end gap-2">
          <button
            type="button"
            className="hidden items-center gap-1.5 rounded-full border border-line/70 bg-surface/40 px-3 py-2 font-mono text-[13px] text-ink-muted backdrop-blur-md transition-colors hover:text-ink xl:inline-flex"
          >
            <Globe className="size-3.5" />
            English
            <ChevronDown className="size-3" />
          </button>

          <Link
            href="/scan"
            className="group inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-ink py-1.5 pl-4 pr-1.5 font-mono text-[13px] font-semibold text-canvas transition-colors hover:bg-white"
          >
            Launch app
            <span className="grid size-6 place-items-center rounded-full bg-lime text-canvas transition-transform group-hover:translate-x-0.5">
              <ArrowRight className="size-3.5" />
            </span>
          </Link>

          <Link
            href="/scan"
            className="hidden shrink-0 whitespace-nowrap rounded-full border border-line-strong px-4 py-2 font-mono text-[13px] text-ink transition-colors hover:border-lime/40 xl:inline-flex"
          >
            Live demo
          </Link>

          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex size-9 items-center justify-center rounded-full border border-line-strong bg-surface/70 text-ink backdrop-blur-md xl:hidden"
          >
            {menuOpen ? <X className="size-[18px]" /> : <Menu className="size-[18px]" />}
          </button>
        </div>
      </div>

      {/* mobile panel */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 bg-canvas/95 backdrop-blur-xl xl:hidden">
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
            {LINKS.filter((l) => !l.dropdown).map((l) => (
              <Link
                key={l.label}
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
                className="rounded-full border border-line-strong py-3 text-center font-mono text-[15px] text-ink"
              >
                Login / Register
              </Link>
              <Link
                href="/scan"
                onClick={() => setMenuOpen(false)}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-ink py-3 font-mono text-[15px] font-semibold text-canvas"
              >
                Launch app
                <span className="grid size-6 place-items-center rounded-full bg-lime text-canvas">
                  <ArrowRight className="size-3.5" />
                </span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
