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
} from "lucide-react";
import { KineticMatrix } from "@/components/ui/kinetic-matrix";
import { HoodWordmark } from "@/components/site/logo";
import { ScanInput } from "@/components/site/scan-input";
import { ProductCard } from "@/components/site/product-card";

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
  { icon: ShieldCheck, title: "Whether it's safe", body: "An A–F grade from concentration, funding, and LP state — with the reasons shown." },
  { icon: History, title: "What a wallet has done", body: "Full reconstructed trade history and P&L, every token." },
];

export default function LandingPage() {
  return (
    <main className="relative">
      {/* ---------- Hero ---------- */}
      <section className="relative h-[100svh] min-h-[640px] w-full overflow-hidden">
        <KineticMatrix
          className="absolute inset-0"
          showControls={false}
          showTitle={false}
        />
        {/* readability wash — kept off the right half so the matrix stays alive */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_75%_at_12%_42%,rgba(6,7,10,0.86)_0%,rgba(6,7,10,0.55)_38%,transparent_72%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-canvas via-canvas/70 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-canvas/80 to-transparent" />

        <div className="relative z-20 mx-auto flex h-full max-w-6xl flex-col px-5 sm:px-8">
          {/* nav */}
          <nav className="flex items-center justify-between py-6">
            <HoodWordmark />
            <div className="hidden items-center gap-7 font-mono text-[12px] text-ink-muted md:flex">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="transition-colors hover:text-ink">
                  {n.label}
                </Link>
              ))}
            </div>
            <Link
              href="/scan"
              className="inline-flex items-center gap-1.5 rounded-xl border border-line-strong bg-surface/70 px-3.5 py-2 font-mono text-[12px] text-ink backdrop-blur-md transition-colors hover:border-lime/40 hover:text-lime"
            >
              Launch
              <ArrowUpRight className="size-3.5" />
            </Link>
          </nav>

          {/* headline */}
          <div className="flex flex-1 flex-col justify-center pb-24 pt-6">
            <div className="max-w-2xl animate-fade-up">
              <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.2em] text-lime">
                Robinhood Chain · Wallet Intelligence
              </p>
              <h1 className="text-balance font-sans text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">
                Paste a contract.
                <br />
                See the wallets.
              </h1>
              <p className="mt-5 max-w-lg text-pretty text-[15px] leading-relaxed text-ink-muted">
                On-chain intelligence for Robinhood Chain — the EVM chain behind Robinhood&apos;s
                memecoin trading. Real holder distribution, connected-wallet clusters, a safety grade,
                and full wallet trade history. Signal, not noise.
              </p>
              <div className="mt-8">
                <ScanInput />
              </div>
            </div>
          </div>

          <div className="pb-6 font-mono text-[11px] tracking-tight text-ink-faint">
            <span className="text-lime">Signal</span> <span className="text-ink-faint">/</span> noise
          </div>
        </div>
      </section>

      {/* ---------- What it reads ---------- */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-3">
          {READS.map((r) => (
            <div
              key={r.title}
              className="rounded-2xl border border-line bg-surface/50 p-5"
            >
              <r.icon className="size-4 text-lime" />
              <h3 className="mt-3 font-mono text-[13px] font-semibold text-ink">{r.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{r.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Products ---------- */}
      <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint">
              The product
            </p>
            <h2 className="mt-2 font-sans text-2xl font-semibold tracking-tight text-ink">
              DexScreener, Bubblemaps, and a P&amp;L tracker — one terminal, one chain.
            </h2>
          </div>
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

      {/* ---------- Evidence / voice ---------- */}
      <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <div className="rounded-2xl border border-line bg-surface-2/60 p-6 sm:p-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint">
            State findings plainly, with the evidence
          </p>
          <p className="mt-4 font-mono text-[15px] leading-relaxed text-ink sm:text-lg">
            <span className="text-lime">3 wallet clusters</span> control{" "}
            <span className="text-lime">41%</span> of supply. Top cluster funded from{" "}
            <span className="text-lime">one address</span>. LP not locked.
          </p>
          <p className="mt-3 font-mono text-[12px] text-ink-faint">
            HoodScore <span className="text-warning">C</span> · reasons attached ·
            derived from on-chain transfer history
          </p>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
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
