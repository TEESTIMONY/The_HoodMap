"use client";

import * as React from "react";
import Link from "next/link";
import { Github, MessageCircle, Send, Twitter } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { HoodWordmark } from "@/components/site/logo";

/**
 * Site footer — a 4-column layout (notify · product · company · social) over a
 * bottom bar with the legal links. Adapted from a shadcn "footer-section" into
 * HoodMap's token system (no shadcn CSS vars, no radix): the brand ships
 * dark-only, so the original light/dark toggle is intentionally dropped.
 */

const PRODUCT_LINKS = [
  { label: "Scan", href: "/scan" },
  { label: "HoodMap view", href: "/map" },
  { label: "Wallet Passport", href: "/wallet" },
  { label: "Top Memecoins", href: "/trending" },
];

const COMPANY_LINKS = [
  { label: "How it works", href: "/how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "Docs", href: "/docs" },
  { label: "Careers", href: "/careers" },
];

const SOCIALS: { icon: LucideIcon; href: string; label: string }[] = [
  { icon: Twitter, href: "https://x.com", label: "Follow us on X" },
  { icon: Send, href: "https://t.me", label: "Join us on Telegram" },
  { icon: MessageCircle, href: "https://discord.com", label: "Chat on Discord" },
  { icon: Github, href: "https://github.com", label: "Source on GitHub" },
];

const LEGAL = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Cookie Settings", href: "/cookies" },
];

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <h3 className="font-mono text-[12px] uppercase tracking-widest text-ink-faint">{title}</h3>
      <nav className="mt-4 space-y-2.5 text-[14px]">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="block text-ink-muted transition-colors hover:text-lime"
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function SocialButton({ icon: Icon, href, label }: (typeof SOCIALS)[number]) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className="group/social relative inline-flex size-10 items-center justify-center rounded-full border border-line-strong text-ink-muted transition-colors hover:border-lime/50 hover:text-lime"
    >
      <Icon className="size-4" />
      <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-line-strong bg-surface-2 px-2 py-1 font-mono text-[11px] text-ink opacity-0 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.9)] transition-opacity group-hover/social:opacity-100">
        {label}
      </span>
    </a>
  );
}

function Footerdemo() {
  const [email, setEmail] = React.useState("");
  const [subscribed, setSubscribed] = React.useState(false);

  const subscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    // Notifications backend lands with the app routes — park the intent for now.
    setSubscribed(true);
  };

  return (
    <footer className="relative border-t border-line bg-canvas text-ink">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-4">
          {/* notify */}
          <div className="relative">
            <h2 className="font-display text-2xl font-bold text-ink">Signal in your inbox</h2>
            <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
              New clusters, HoodScore changes, and whales on the move — no noise.
            </p>
            <form onSubmit={subscribe} className="relative mt-5">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@wallet.xyz"
                className="w-full rounded-full border border-line-strong bg-surface/70 py-3 pl-4 pr-14 text-[13px] leading-relaxed text-ink backdrop-blur-sm placeholder:text-ink-faint focus:border-lime/50 focus:outline-none"
              />
              <button
                type="submit"
                aria-label="Subscribe"
                className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-lime text-canvas transition-transform hover:scale-105"
              >
                <Send className="size-4" />
              </button>
            </form>
            <p
              className="mt-2 min-h-[1rem] px-4 font-mono text-[12px] text-moss-soft"
              aria-live="polite"
            >
              {subscribed ? "You're on the list." : ""}
            </p>
            <div className="pointer-events-none absolute -right-6 top-0 size-24 rounded-full bg-lime/10 blur-2xl" />
          </div>

          <FooterColumn title="Product" links={PRODUCT_LINKS} />
          <FooterColumn title="Company" links={COMPANY_LINKS} />

          {/* social */}
          <div>
            <h3 className="font-mono text-[12px] uppercase tracking-widest text-ink-faint">
              Follow us
            </h3>
            <div className="mt-4 flex gap-3">
              {SOCIALS.map((s) => (
                <SocialButton key={s.label} {...s} />
              ))}
            </div>
            <p className="mt-6 text-[13px] leading-relaxed text-ink-muted">
              Built on Robinhood Chain. Questions?{" "}
              <a
                href="mailto:hello@hoodmap.app"
                className="text-ink underline underline-offset-2 hover:text-lime"
              >
                hello@hoodmap.app
              </a>
            </p>
          </div>
        </div>

        <p className="mt-14 max-w-2xl text-[12px] leading-relaxed text-ink-faint">
          HoodMap is an independent analytics tool. Not affiliated with, endorsed by, or connected to
          Robinhood Markets, Inc. Wallet metrics are derived from on-chain activity and may be
          incomplete where transaction intent or history outside the scan window can&apos;t be
          determined. Not financial advice.
        </p>

        <div className="mt-8 flex flex-col items-center gap-5 border-t border-line pt-8 text-center md:flex-row md:justify-between md:text-left">
          <HoodWordmark />
          <p className="order-3 font-mono text-[12px] text-ink-faint md:order-2">
            © 2026 HoodMap. All rights reserved.
          </p>
          <nav className="order-2 flex flex-wrap justify-center gap-4 font-mono text-[12px] text-ink-muted md:order-3">
            {LEGAL.map((l) => (
              <Link key={l.href} href={l.href} className="transition-colors hover:text-lime">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}

export { Footerdemo };
