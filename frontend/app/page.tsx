import Link from "next/link";
import {
  Radar,
  Waypoints,
  Wallet,
  Flame,
  ShieldCheck,
  Network,
  History,
  ArrowRight,
  ArrowDown,
  FlaskConical,
  Check,
  Clock,
  Info,
  Twitter,
  Send,
  Github,
  MessageCircle,
} from "lucide-react";
import { GatewayFlow } from "@/components/ui/gateway-flow";
import { Footerdemo } from "@/components/ui/footer-section";
import { HoodMark } from "@/components/site/logo";
import { SiteNav } from "@/components/site/site-nav";
import { CookieBar } from "@/components/site/cookie-bar";
import { HeroDecor } from "@/components/site/hero-decor";
import { ScanInput } from "@/components/site/scan-input";
import { ProductCard } from "@/components/site/product-card";

const HERO_CHIPS = [
  { icon: FlaskConical, label: "On-chain, not scraped" },
  { icon: Check, label: "No login" },
  { icon: Clock, label: "Live updates" },
  { icon: Info, label: "Every token & wallet" },
];

const SOCIALS = [
  { icon: Twitter, href: "https://x.com", label: "X" },
  { icon: Send, href: "https://t.me", label: "Telegram" },
  { icon: MessageCircle, href: "https://discord.com", label: "Discord" },
  { icon: Github, href: "https://github.com", label: "GitHub" },
];

const PRODUCTS = [
  {
    icon: Radar,
    name: "Scan",
    status: "live" as const,
    blurb:
      "Paste a token contract. Holder distribution, connected-wallet clusters, a HoodScore safety grade with reasons, whale table, and a live transaction feed.",
  },
  {
    icon: Waypoints,
    name: "HoodMap view",
    status: "live" as const,
    blurb:
      "The signature view: a force-directed bubble map of holders — sized by share of supply, coloured by cluster, with funder→funded arrows showing how a cluster was seeded.",
  },
  {
    icon: Wallet,
    name: "Wallet Passport",
    status: "live" as const,
    blurb:
      "Paste any wallet. Reconstructed trade history, win rate, realized P&L, open and closed positions — across every token it has touched, not just one.",
  },
  {
    icon: Flame,
    name: "Top Memecoins",
    status: "live" as const,
    blurb:
      "Trending tokens on Robinhood Chain — a starting point for discovery when you don't have an address in hand yet.",
  },
];

const READS = [
  { icon: Network, title: "Who's connected", body: "Wallet clusters and the addresses that funded them." },
  {
    icon: ShieldCheck,
    title: "Whether it's safe",
    body: "An A–F grade from concentration, funding, and LP state — with the reasons shown.",
  },
  { icon: History, title: "What a wallet has done", body: "Full reconstructed trade history and P&L, every token." },
];

export default function LandingPage() {
  return (
    <main className="relative">
      <SiteNav />

      {/* ================= Hero ================= */}
      <section className="relative flex min-h-[100svh] flex-col overflow-hidden">
        {/* converging flow */}
        <GatewayFlow className="absolute inset-0" convergeY={0.8} density={0.85} opacity={0.8} />
        <HeroDecor />

        {/* washes for legibility */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-canvas via-canvas/70 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-canvas via-canvas/85 to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_55%_at_50%_52%,transparent_0%,rgba(6,7,10,0.35)_70%,rgba(6,7,10,0.7)_100%)]" />

        {/* green glow behind the headline */}
        <div className="pointer-events-none absolute left-1/2 top-[46%] h-[380px] w-[min(760px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-moss/15 blur-[130px]" />

        {/* logo at the convergence of the flow lines */}
        <div className="pointer-events-none absolute left-1/2 top-[84%] z-10 -translate-x-1/2 -translate-y-1/2 sm:top-[80%]">
          <div className="relative">
            <div className="absolute inset-0 -z-10 rounded-full bg-lime/20 blur-2xl" />
            <HoodMark className="size-14 drop-shadow-[0_0_16px_rgba(214,250,77,0.6)]" />
          </div>
        </div>

        {/* content */}
        <div className="relative z-30 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-5 pb-16 pt-28 text-center">
          {/* moved-down block */}
          <div className="my-auto flex w-full flex-col items-center">
            {/* eyebrow — directly above the headline */}
            <div className="mb-4 inline-flex items-center gap-2 font-mono text-[13px] text-ink-faint sm:mb-6 sm:text-sm">
              <span className="size-1.5 rounded-full bg-lime" />
              Intelligence layer of Robinhood Chain
            </div>

            {/* headline */}
            <h1 className="mx-auto max-w-[12ch] font-display text-[12vw] font-bold uppercase leading-[0.98] tracking-[-0.01em] text-ink [text-shadow:0_0_44px_rgba(23,176,74,0.35)] sm:max-w-none sm:text-6xl md:text-7xl lg:text-[4.75rem]">
              HoodMap
              <br />
              <span className="text-lime">Wallet Intelligence</span>
            </h1>

            {/* feature chips */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[12px] text-ink-muted sm:mt-7 sm:text-[13px]">
              {HERO_CHIPS.map((c) => (
                <span key={c.label} className="inline-flex items-center gap-1.5">
                  <c.icon className="size-4 text-lime" />
                  {c.label}
                </span>
              ))}
            </div>

            {/* CTAs */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 sm:mt-9">
              <Link
                href="/scan"
                className="group inline-flex items-center gap-2.5 rounded-full bg-ink py-2 pl-6 pr-2 font-mono text-[14px] font-semibold text-canvas transition-colors hover:bg-white"
              >
                Launch app
                <span className="grid size-7 place-items-center rounded-full bg-lime text-canvas transition-transform group-hover:translate-x-0.5">
                  <ArrowRight className="size-4" />
                </span>
              </Link>
              <Link
                href="/scan"
                className="inline-flex items-center rounded-full border border-line-strong bg-surface/40 px-6 py-3 font-mono text-[14px] text-ink backdrop-blur-md transition-colors hover:border-lime/40"
              >
                Live demo
              </Link>
            </div>

            {/* scan bar — directly below the CTAs */}
            <ScanInput className="mt-5 max-w-2xl sm:mt-7" />
          </div>
        </div>

        {/* bottom rail */}
        <div className="relative z-30 mx-auto flex w-full max-w-[1600px] items-end justify-between gap-4 px-5 pb-8 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3.5 font-mono text-[13px] text-ink-faint">
            <span className="hidden sm:inline">Follow us</span>
            <div className="flex items-center gap-3.5">
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={s.label}
                  className="text-ink-muted transition-colors hover:text-lime"
                >
                  <s.icon className="size-[18px]" />
                </a>
              ))}
            </div>
          </div>
          <div className="hidden items-center gap-2 font-mono text-[13px] text-ink-faint sm:flex">
            Scroll to explore
            <ArrowDown className="size-4 animate-bounce" />
          </div>
        </div>
      </section>

      {/* ================= What it reads ================= */}
      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-3">
          {READS.map((r) => (
            <div key={r.title} className="rounded-2xl border border-line bg-surface/50 p-6">
              <r.icon className="size-6 text-lime" />
              <h3 className="mt-4 font-display text-xl font-semibold text-ink">{r.title}</h3>
              <p className="mt-2 text-[16px] leading-relaxed text-ink-muted">{r.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ================= Products ================= */}
      <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
        <div className="mb-10">
          <p className="font-mono text-[14px] uppercase tracking-[0.2em] text-ink-faint">
            The product
          </p>
          <h2 className="mt-3 max-w-4xl font-display text-[2.5rem] font-bold uppercase leading-[1.05] text-ink sm:text-6xl">
            DexScreener, Bubblemaps, and a P&amp;L tracker — one terminal, one chain.
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {PRODUCTS.map((p) => (
            <ProductCard key={p.name} {...p} />
          ))}
        </div>
        <p className="mt-6 font-mono text-[14px] text-ink-faint">
          In progress: Constellation (social graph) · Notifications · Profiles
        </p>
      </section>

      {/* ================= Evidence / voice ================= */}
      <section className="mx-auto max-w-6xl px-5 pb-28 sm:px-8">
        <div className="rounded-2xl border border-line bg-surface-2/60 p-7 sm:p-10">
          <p className="font-mono text-[14px] uppercase tracking-[0.2em] text-ink-faint">
            State findings plainly, with the evidence
          </p>
          <p className="mt-5 font-mono text-xl leading-relaxed text-ink sm:text-2xl">
            <span className="text-lime">3 wallet clusters</span> control <span className="text-lime">41%</span>{" "}
            of supply. Top cluster funded from <span className="text-lime">one address</span>. LP not
            locked.
          </p>
          <p className="mt-4 font-mono text-[15px] text-ink-faint">
            HoodScore <span className="text-warning">C</span> · reasons attached · derived from
            on-chain transfer history
          </p>
        </div>
      </section>

      {/* ================= Footer ================= */}
      <Footerdemo />

      <CookieBar />
    </main>
  );
}
