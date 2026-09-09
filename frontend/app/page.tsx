import Link from "next/link";
import {
  Radar,
  Waypoints,
  Wallet,
  Flame,
  ArrowUpRight,
  ShieldCheck,
  Network,
  History,
  TrendingUp,
  Boxes,
} from "lucide-react";
import { GatewayFlow } from "@/components/ui/gateway-flow";
import { HoodMark, HoodWordmark } from "@/components/site/logo";
import { ScanInput } from "@/components/site/scan-input";
import { ProductCard } from "@/components/site/product-card";
import { EdgeCard } from "@/components/site/edge-card";

const NAV = [
  { label: "Scan", href: "/scan" },
  { label: "Map", href: "/map" },
  { label: "Passport", href: "/wallet" },
  { label: "Trending", href: "/trending" },
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
      {/* ================= Hero ================= */}
      <section className="relative flex min-h-[100svh] flex-col overflow-hidden">
        {/* converging flow */}
        <GatewayFlow className="absolute inset-0" convergeY={0.56} density={1} />

        {/* washes for legibility */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-canvas via-canvas/70 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-canvas via-canvas/85 to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_55%_at_50%_56%,transparent_0%,rgba(6,7,10,0.35)_70%,rgba(6,7,10,0.7)_100%)]" />

        {/* bottom dome */}
        <div className="pointer-events-none absolute -bottom-[46vw] left-1/2 h-[70vw] w-[92vw] -translate-x-1/2 rounded-[50%] border border-line-strong bg-[radial-gradient(60%_60%_at_50%_0%,rgba(214,250,77,0.06)_0%,rgba(6,7,10,0)_60%)]" />

        {/* convergence emblem */}
        <div className="pointer-events-none absolute left-1/2 top-[56%] z-10 -translate-x-1/2 -translate-y-1/2">
          <div className="relative">
            <div className="absolute inset-0 -z-10 rounded-full bg-lime/20 blur-2xl" />
            <HoodMark className="size-14 drop-shadow-[0_0_16px_rgba(214,250,77,0.6)]" />
          </div>
        </div>

        {/* edge stat cards */}
        <EdgeCard
          side="left"
          icon={Boxes}
          eyebrow="Holder clusters"
          primary="3 clusters · 41%"
          secondary="Funded from one address"
        />
        <EdgeCard
          side="right"
          icon={TrendingUp}
          eyebrow="Wallet passport"
          primary="74% win rate"
          secondary="+$13,215 realized"
        />

        {/* content */}
        <div className="relative z-30 mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 sm:px-8">
          {/* nav */}
          <nav className="flex items-center justify-between py-6">
            <HoodWordmark />
            <div className="hidden items-center gap-1 rounded-full border border-line-strong bg-surface/60 px-2 py-1.5 font-mono text-[12px] text-ink-muted backdrop-blur-md md:flex">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded-full px-3 py-1 transition-colors hover:bg-surface-3 hover:text-ink"
                >
                  {n.label}
                </Link>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/scan"
                className="hidden rounded-xl border border-line-strong bg-surface/70 px-3.5 py-2 font-mono text-[12px] text-ink-muted backdrop-blur-md transition-colors hover:text-ink sm:inline-flex"
              >
                Login
              </Link>
              <Link
                href="/scan"
                className="inline-flex items-center gap-1.5 rounded-xl bg-lime px-3.5 py-2 font-mono text-[12px] font-semibold text-canvas transition-shadow hover:shadow-glow-lime-sm"
              >
                Launch
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>
          </nav>

          {/* headline */}
          <div className="flex flex-col items-center pt-[7vh] text-center">
            <span className="mb-6 max-w-[92vw] rounded-full border border-line bg-surface/50 px-3.5 py-1.5 text-center font-mono text-[9px] tracking-wide text-ink-muted backdrop-blur-md sm:text-[11px]">
              Who holds it · who&apos;s connected · is it safe
            </span>
            <h1 className="mx-auto max-w-[12ch] font-display text-[9vw] font-normal uppercase leading-[1.03] tracking-tight text-ink sm:max-w-none sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl">
              HoodMap
              <br />
              <span className="text-lime">Wallet Intelligence</span>
            </h1>
          </div>

          {/* bottom CTA */}
          <div className="mt-auto flex flex-col items-center gap-6 pb-14 text-center">
            <p className="max-w-sm text-pretty text-[15px] leading-relaxed text-ink-muted">
              Want to see who really holds a token — and how a wallet has actually done — before you
              buy in?
            </p>
            <ScanInput className="max-w-lg" />
          </div>
        </div>
      </section>

      {/* ================= What it reads ================= */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-3">
          {READS.map((r) => (
            <div key={r.title} className="rounded-2xl border border-line bg-surface/50 p-5">
              <r.icon className="size-4 text-lime" />
              <h3 className="mt-3 font-mono text-[13px] font-semibold text-ink">{r.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{r.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ================= Products ================= */}
      <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
        <div className="mb-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint">The product</p>
          <h2 className="mt-2 font-display text-3xl uppercase tracking-tight text-ink sm:text-4xl">
            DexScreener, Bubblemaps, and a P&amp;L tracker — one terminal, one chain.
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {PRODUCTS.map((p) => (
            <ProductCard key={p.name} {...p} />
          ))}
        </div>
        <p className="mt-6 font-mono text-[11px] text-ink-faint">
          In progress: Constellation (social graph) · Notifications · Profiles
        </p>
      </section>

      {/* ================= Evidence / voice ================= */}
      <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <div className="rounded-2xl border border-line bg-surface-2/60 p-6 sm:p-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint">
            State findings plainly, with the evidence
          </p>
          <p className="mt-4 font-mono text-[15px] leading-relaxed text-ink sm:text-lg">
            <span className="text-lime">3 wallet clusters</span> control <span className="text-lime">41%</span>{" "}
            of supply. Top cluster funded from <span className="text-lime">one address</span>. LP not
            locked.
          </p>
          <p className="mt-3 font-mono text-[12px] text-ink-faint">
            HoodScore <span className="text-warning">C</span> · reasons attached · derived from
            on-chain transfer history
          </p>
        </div>
      </section>

      {/* ================= Footer ================= */}
      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <HoodWordmark />
            <div className="flex flex-wrap gap-6 font-mono text-[12px] text-ink-muted">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="transition-colors hover:text-ink">
                  {n.label}
                </Link>
              ))}
            </div>
          </div>
          <p className="mt-8 max-w-2xl text-[11px] leading-relaxed text-ink-faint">
            HoodMap is an independent analytics tool. Not affiliated with, endorsed by, or connected
            to Robinhood Markets, Inc. Wallet metrics are derived from on-chain activity and may be
            incomplete where transaction intent or history outside the scan window can&apos;t be
            determined. Not financial advice.
          </p>
        </div>
      </footer>
    </main>
  );
}
