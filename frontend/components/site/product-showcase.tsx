import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/site/reveal";

/**
 * "What is HoodMap" — an editorial split: a sticky statement + animated lattice
 * on the left, the four shipped tools as a hairline-divided list on the right,
 * and a live-pair ticker underneath that pays off the Top Memecoins tool.
 *
 * Motion: the lattice turns slowly (ambient "the system is running"), each tool
 * row does a heavy fade-up as it enters view (walks the reader through the set),
 * hover slides an arrow in (feedback), and the ticker scrolls (breadth of the
 * feed). All of it collapses to static under prefers-reduced-motion.
 */

type Highlight = { text: string; strong?: boolean };

const TOOLS: {
  name: string;
  href: string;
  body: Highlight[];
}[] = [
  {
    name: "Scan",
    href: "/scan",
    body: [
      { text: "Paste a token contract. Holder distribution, connected-wallet clusters, a " },
      { text: "HoodScore safety grade with its reasons", strong: true },
      { text: ", a whale table, and a live transaction feed." },
    ],
  },
  {
    name: "HoodMap view",
    href: "/map",
    body: [
      { text: "The signature view. A " },
      { text: "force-directed bubble map of holders", strong: true },
      {
        text: ", sized by share of supply, coloured by cluster, with funder-to-funded arrows showing how a cluster was seeded.",
      },
    ],
  },
  {
    name: "Wallet Passport",
    href: "/wallet",
    body: [
      { text: "Paste any wallet. Reconstructed trade history, win rate, realized P&L, open and closed positions, " },
      { text: "across every token it has touched", strong: true },
      { text: " rather than one." },
    ],
  },
  {
    name: "Top Memecoins",
    href: "/trending",
    body: [
      { text: "Trending tokens on Robinhood Chain. Where to start " },
      { text: "when you don't have an address", strong: true },
      { text: " in hand yet." },
    ],
  },
];

type Pair = { sym: string; price: string; change: string; up: boolean; tint: string };

const PAIRS: Pair[] = [
  { sym: "ROBINCAT", price: "$0.00431", change: "+64.2%", up: true, tint: "#D6FA4D" },
  { sym: "HOODRAT", price: "$0.0192", change: "-27.9%", up: false, tint: "#FB7185" },
  { sym: "GIGACHAD", price: "$1.07", change: "+8.1%", up: true, tint: "#7CE38A" },
  { sym: "MOONPIG", price: "$0.000084", change: "+412%", up: true, tint: "#FBBF24" },
  { sym: "TENDIES", price: "$0.0067", change: "-4.4%", up: false, tint: "#9AA1AE" },
  { sym: "BONKINU", price: "$0.00000291", change: "+19.6%", up: true, tint: "#E6FF9E" },
  { sym: "DEGEN", price: "$0.041", change: "-11.3%", up: false, tint: "#FB7185" },
  { sym: "WAGMI", price: "$0.318", change: "+2.7%", up: true, tint: "#34D399" },
  { sym: "PONZI", price: "$0.0009", change: "-52.8%", up: false, tint: "#FB7185" },
  { sym: "GROKINU", price: "$0.0224", change: "+7.9%", up: true, tint: "#D6FA4D" },
];

function Lattice() {
  // Isometric octahedron — vertices + edges, echoing the network-graph mark.
  const v = {
    top: [150, 44],
    bottom: [150, 256],
    left: [52, 150],
    right: [248, 150],
    near: [150, 198],
    far: [150, 102],
  } as const;
  const edges: [keyof typeof v, keyof typeof v][] = [
    ["top", "left"],
    ["top", "right"],
    ["top", "near"],
    ["top", "far"],
    ["bottom", "left"],
    ["bottom", "right"],
    ["bottom", "near"],
    ["bottom", "far"],
    ["left", "near"],
    ["near", "right"],
    ["right", "far"],
    ["far", "left"],
  ];
  return (
    <div className="relative flex aspect-square items-center justify-center">
      <div className="absolute inset-[18%] rounded-full bg-lime/10 blur-3xl" />
      <svg
        viewBox="0 0 300 300"
        className="h-full w-full animate-spin-slow text-lime [transform-origin:50%_50%]"
        aria-hidden
      >
        {edges.map(([a, b], i) => (
          <line
            key={i}
            x1={v[a][0]}
            y1={v[a][1]}
            x2={v[b][0]}
            y2={v[b][1]}
            stroke="currentColor"
            strokeWidth={1}
            strokeOpacity={0.55}
          />
        ))}
        {Object.values(v).map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={3.4} fill="#06070a" stroke="currentColor" strokeWidth={1.75} />
        ))}
        <circle cx={150} cy={150} r={4.4} fill="#06070a" stroke="currentColor" strokeWidth={2} />
      </svg>
    </div>
  );
}

function TickerRow({ reverse = false }: { reverse?: boolean }) {
  const items = [...PAIRS, ...PAIRS];
  return (
    <div
      className={cn(
        "flex w-max gap-3 will-change-transform",
        reverse ? "animate-marquee-reverse" : "animate-marquee",
        "group-hover:[animation-play-state:paused]"
      )}
    >
      {items.map((p, i) => (
        <div
          key={i}
          className="flex shrink-0 items-center gap-2.5 rounded-full border border-line bg-surface/60 py-2 pl-2 pr-3.5 backdrop-blur-sm"
        >
          <span
            className="grid size-5 shrink-0 place-items-center rounded-full text-[9px] font-semibold text-canvas"
            style={{ backgroundColor: p.tint }}
          >
            {p.sym.slice(0, 1)}
          </span>
          <span className="font-mono text-[12px] text-ink">{p.sym}</span>
          <span className="tabular font-mono text-[12px] text-ink-muted">{p.price}</span>
          <span
            className={cn(
              "tabular font-mono text-[11px]",
              p.up ? "text-success" : "text-danger"
            )}
          >
            {p.change}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ProductShowcase() {
  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-14 lg:grid-cols-[0.82fr_1fr] lg:gap-16">
          {/* left — statement + lattice */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <h2 className="font-display text-[2.75rem] font-normal leading-[1.03] text-ink [text-shadow:0_0_40px_rgba(23,176,74,0.3)] sm:text-5xl">
              See the wallets.
              <br />
              <span className="text-lime">Not the noise.</span>
            </h2>
            <p className="mt-5 max-w-[26ch] text-[15px] leading-relaxed text-ink-muted">
              Four tools. One on-chain history, four ways to read it.
            </p>
            <div className="mt-10 max-w-[240px] rounded-[1.75rem] border border-line-strong bg-surface/40 p-2 sm:max-w-[320px]">
              <div className="relative overflow-hidden rounded-[calc(1.75rem-0.5rem)] border border-line bg-canvas">
                <Lattice />
              </div>
            </div>
          </div>

          {/* right — the toolset */}
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface/50 px-3.5 py-1.5 font-mono text-[12px] text-ink-muted backdrop-blur-md">
              What is <span className="text-lime">HoodMap</span>?
            </span>
            <h3 className="mt-5 max-w-[16ch] font-display text-[1.9rem] font-bold uppercase leading-[1.08] tracking-[-0.01em] text-ink sm:text-[2.4rem]">
              DexScreener, Bubblemaps, and a P&amp;L tracker.
            </h3>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-muted">
              Paste a token or a wallet. Everything below reads the same raw transfer history. No
              login, no black box.
            </p>

            <ul className="mt-12 border-t border-line">
              {TOOLS.map((tool, i) => (
                <Reveal as="li" key={tool.name} delay={i * 80} className="border-b border-line">
                  <Link
                    href={tool.href}
                    className="group flex flex-col gap-2.5 py-7 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-moss-soft">
                        <span className="size-1.5 rounded-full bg-moss shadow-[0_0_8px_rgba(23,176,74,0.9)]" />
                        Live
                      </span>
                      <h4 className="font-display text-xl font-semibold text-ink transition-colors group-hover:text-lime sm:text-2xl">
                        {tool.name}
                      </h4>
                      <ArrowUpRight className="ml-auto size-5 shrink-0 -translate-x-1 text-ink-faint opacity-0 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0 group-hover:text-lime group-hover:opacity-100" />
                    </div>
                    <p className="max-w-xl text-[15px] leading-relaxed text-ink-muted">
                      {tool.body.map((seg, j) => (
                        <span key={j} className={seg.strong ? "text-ink" : undefined}>
                          {seg.text}
                        </span>
                      ))}
                    </p>
                  </Link>
                </Reveal>
              ))}
            </ul>

            <p className="mt-8 font-mono text-[13px] text-ink-faint">
              In progress: Constellation (social graph), Notifications, Profiles.
            </p>
          </div>
        </div>
      </div>

      {/* live-pair ticker — breadth of the Top Memecoins feed */}
      <div className="group mt-20 flex flex-col gap-3 sm:mt-28 [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]">
        <TickerRow />
        <TickerRow reverse />
      </div>
    </section>
  );
}
