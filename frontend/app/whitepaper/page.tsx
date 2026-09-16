import type { Metadata } from "next";
import { Flame, Radar, Wallet, Waypoints } from "lucide-react";
import { SiteNav } from "@/components/site/site-nav";
import { Footerdemo } from "@/components/ui/footer-section";

export const metadata: Metadata = {
  title: "Whitepaper — HoodMap",
  description:
    "What HoodMap does, its four tools, and how to read a HoodScore — in plain language, no jargon.",
};

const SECTIONS = [
  { id: "problem", n: "01", label: "The Problem" },
  { id: "what", n: "02", label: "What HoodMap Is" },
  { id: "tools", n: "03", label: "The Four Tools" },
  { id: "score", n: "04", label: "Reading a HoodScore" },
  { id: "custody", n: "05", label: "Non-Custodial by Design" },
  { id: "independent", n: "06", label: "Independent By Design" },
  { id: "next", n: "07", label: "What's Next" },
] as const;

function SectionHead({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-baseline gap-3.5">
      <span className="font-mono text-[13px] text-moss-soft">{n}</span>
      <h2 className="font-display text-[1.5rem] font-bold tracking-[-0.01em] sm:text-[1.95rem]">
        {children}
      </h2>
    </div>
  );
}

function Lede({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[64ch] text-[18px] font-medium leading-relaxed text-ink">{children}</p>;
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 max-w-[64ch] text-[15.5px] leading-[1.85] text-ink-muted">{children}</p>
  );
}

const TAGS = ["Non-custodial", "Independent", "Public addresses only", "No wallet connection required"];

const TOOLS = [
  {
    icon: Radar,
    num: "TOOL 01",
    title: "Scan",
    q: "is this token safe?",
    body: "Paste a contract and get a full read in seconds: how concentrated ownership is, whether separate-looking wallets are secretly connected, and a HoodScore grade with the actual reasons behind it — not just a letter.",
  },
  {
    icon: Waypoints,
    num: "TOOL 02",
    title: "HoodMap View",
    q: "who really holds this?",
    body: "Every holder becomes a bubble, sized by how much they hold and colored by who funded them. Clusters and insiders that would take an hour to trace in an explorer become obvious the moment the map loads.",
  },
  {
    icon: Flame,
    num: "TOOL 03",
    title: "Trending",
    q: "what's actually moving?",
    body: "A constantly refreshed leaderboard of tokens with real volume and liquidity behind them, filtered down from a chain where most launches never trade twice.",
  },
  {
    icon: Wallet,
    num: "TOOL 04",
    title: "Wallet Passport",
    q: "who am I trading against?",
    body: "Paste any wallet and get its resume: win rate, realized and unrealized profit, every trade it's made. Your own, or the whale you keep seeing in the feed — turn it into a card and share it.",
  },
];

const SIGNALS = [
  { label: "CONCENTRATION", desc: "How much of the supply sits in a small number of wallets." },
  { label: "HIDDEN CLUSTERS", desc: "Whether wallets that look separate were actually funded from the same source." },
  { label: "INSIDER BEHAVIOR", desc: "How the earliest holders — the deployer, snipers, early buyers — have acted since." },
  { label: "ORGANIC DEMAND", desc: "Whether new buyers keep showing up on their own, or activity has gone quiet." },
];

const PRINCIPLES = [
  {
    title: "No seed phrase. No private key. No password.",
    body: "HoodMap only ever needs a public address — the same information anyone could already look up on a block explorer.",
  },
  {
    title: "No wallet connection required",
    body: "You don't sign anything or approve anything to look a wallet up. Paste it, read it, done.",
  },
  {
    title: "Look up any address, not just your own",
    body: "Every tool works the same whether you're checking your own history or sizing up someone else's.",
  },
];

const GAUGE = [
  { grade: "F", color: "bg-danger", text: "text-danger" },
  { grade: "D", color: "bg-orange-400", text: "text-orange-400" },
  { grade: "C", color: "bg-warning", text: "text-warning" },
  { grade: "B", color: "bg-lime-soft", text: "text-lime-soft" },
  { grade: "A", color: "bg-moss-soft", text: "text-moss-soft" },
];

export default function WhitepaperPage() {
  return (
    <main className="relative min-h-[100svh] bg-canvas">
      <SiteNav />

      <div className="mx-auto max-w-[1180px] px-5 pb-16 pt-24 sm:px-6 sm:pt-28">
        <div className="grid items-start gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14">
          {/* section-index rail */}
          <aside className="hidden lg:sticky lg:top-24 lg:flex lg:flex-col lg:gap-6">
            <nav aria-label="Sections" className="flex flex-col gap-px">
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="-ml-3.5 flex items-baseline gap-2.5 border-l-2 border-transparent px-3.5 py-1.5 font-mono text-[12.5px] text-ink-faint transition-colors hover:border-line-strong hover:text-ink"
                >
                  <b className="min-w-[18px] font-medium text-ink-faint">{s.n}</b>
                  {s.label}
                </a>
              ))}
            </nav>
            <div className="border-t border-line pt-2 font-mono text-[11px] leading-[1.8] text-ink-faint">
              Whitepaper · v1.0
              <br />
              Robinhood Chain · 4663
            </div>
          </aside>

          {/* content */}
          <div className="min-w-0">
            {/* title block */}
            <div className="pb-2">
              <p className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-lime">
                <span className="size-1.5 rounded-full bg-lime shadow-[0_0_10px_2px_rgba(214,250,77,0.6)]" />
                HoodMap · Whitepaper · v1.0
              </p>
              <h1 className="mt-4 max-w-[20ch] font-display text-[1.9rem] font-bold leading-[1.14] tracking-[-0.01em] sm:text-[2.5rem]">
                Every wallet leaves a trail. We read it <span className="text-lime">before</span> you trade.
              </h1>
              <p className="mt-4 max-w-[62ch] text-[16px] leading-relaxed text-ink-muted">
                Robinhood Chain moves fast and launches constantly. HoodMap is the layer that turns
                its raw, nonstop activity — every token, every holder, every wallet — into something
                a person can actually look at and understand, without reading a block explorer for a living.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {TAGS.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-line-strong bg-white/[0.025] px-3 py-1.5 font-mono text-[11px] tracking-wide text-ink-muted"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* 01 — The Problem */}
            <section id="problem" className="mt-14 scroll-mt-24 pt-14">
              <SectionHead n="01">The Problem</SectionHead>
              <Lede>
                A new chain built for launching tokens attracts exactly what you&apos;d expect: an
                enormous amount of noise.
              </Lede>
              <Body>
                Most tokens that go live never trade again after their first few minutes. Buried
                inside that noise are the ones that matter — real communities, real liquidity, real
                trading — but nothing about a raw contract address tells you which is which. Two
                tokens can look identical on paper. One has fifty holders who all got their tokens
                from the same wallet an hour before launch. The other has an organic spread of
                buyers who found it on their own. You can&apos;t tell the difference by staring at a number.
              </Body>
              <Body>
                The same problem exists for wallets. An address is just forty characters of hex —
                it tells you nothing about whether the person behind it is a consistent winner, a
                serial rug-puller, or a bot. Finding out means manually reconstructing a trade
                history from thousands of individual transactions, by hand.
              </Body>
              <p className="mt-8 max-w-[58ch] border-l-2 border-lime pl-6 font-display text-[1.2rem] font-medium leading-relaxed text-ink">
                Nobody should need to read raw blockchain data to know what they&apos;re looking at.
              </p>
            </section>

            {/* 02 — What HoodMap Is */}
            <section id="what" className="mt-14 scroll-mt-24 border-t border-line pt-14">
              <SectionHead n="02">What HoodMap Is</SectionHead>
              <Lede>
                HoodMap is the intelligence layer for Robinhood Chain — one place that watches
                everything happening on-chain and states, in plain language, what it found.
              </Lede>
              <Body>
                Think of it as three tools people already understand, built for one chain: a
                screener like you&apos;d use to watch what&apos;s trending, a holder map like you&apos;d use
                to see who really owns something, and a trade history like you&apos;d pull up for any
                trader you were sizing up — except all three point at the same wallet the instant
                you paste it in.
              </Body>
              <Body>
                HoodMap doesn&apos;t hold your funds, doesn&apos;t need your permission, and doesn&apos;t
                require an account. You paste an address — a token or a wallet, yours or anyone
                else&apos;s — and it hands back what the chain already knows, organized so you can
                actually use it.
              </Body>
            </section>

            {/* 03 — The Four Tools */}
            <section id="tools" className="mt-14 scroll-mt-24 border-t border-line pt-14">
              <SectionHead n="03">The Four Tools</SectionHead>
              <Lede>Four ways to read the same chain, each built around one question.</Lede>

              <div className="mt-2 grid gap-3.5 sm:grid-cols-2">
                {TOOLS.map((t) => (
                  <div
                    key={t.title}
                    className="flex flex-col gap-3 rounded-2xl border border-line bg-gradient-to-b from-surface-2 to-surface p-6"
                  >
                    <div className="grid size-9 place-items-center rounded-[10px] border border-lime/20 bg-lime/10 text-lime">
                      <t.icon className="size-[18px]" />
                    </div>
                    <span className="font-mono text-[10.5px] tracking-[0.1em] text-ink-faint">{t.num}</span>
                    <h3 className="font-display text-[1.05rem] font-bold text-ink">
                      <span className="text-lime">{t.title}</span> — {t.q}
                    </h3>
                    <p className="text-[14px] leading-[1.7] text-ink-muted">{t.body}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* 04 — Reading a HoodScore */}
            <section id="score" className="mt-14 scroll-mt-24 border-t border-line pt-14">
              <SectionHead n="04">Reading a HoodScore</SectionHead>
              <Lede>
                Every scanned token gets a single letter grade — the fastest way to know whether
                something is worth a closer look.
              </Lede>

              <div className="mt-6 rounded-2xl border border-line bg-surface p-6 sm:p-7">
                <div className="grid h-2.5 grid-cols-5 gap-1 overflow-hidden rounded-full">
                  {GAUGE.map((g) => (
                    <span key={g.grade} className={g.color} />
                  ))}
                </div>
                <div className="mt-2.5 grid grid-cols-5 font-display text-[15px] font-bold">
                  {GAUGE.map((g) => (
                    <span key={g.grade} className={`text-center ${g.text}`}>
                      {g.grade}
                    </span>
                  ))}
                </div>
                <p className="mt-4 text-center text-[13.5px] text-ink-faint">
                  Riskiest supply structure on the left, cleanest on the right.
                </p>
              </div>

              <Body>
                The grade isn&apos;t a black box — HoodMap always shows its reasoning alongside the
                letter. Under the hood, it&apos;s weighing the same questions an experienced trader
                would ask by hand:
              </Body>

              <div className="mt-5 grid gap-2.5">
                {SIGNALS.map((s) => (
                  <div
                    key={s.label}
                    className="grid grid-cols-[18px_1fr] items-baseline gap-4 rounded-xl border border-line bg-surface px-5 py-4 sm:grid-cols-[22px_150px_1fr]"
                  >
                    <span className="size-[7px] self-center rounded-full bg-moss-soft" />
                    <span className="font-mono text-[12px] tracking-wide text-lime-soft">{s.label}</span>
                    <span className="col-span-2 text-[14.5px] leading-relaxed text-ink-muted sm:col-span-1">
                      {s.desc}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* 05 — Non-Custodial by Design */}
            <section id="custody" className="mt-14 scroll-mt-24 border-t border-line pt-14">
              <SectionHead n="05">Non-Custodial by Design</SectionHead>
              <Lede>HoodMap never touches your funds, and never asks to.</Lede>

              <div className="mt-5 flex flex-col gap-2.5">
                {PRINCIPLES.map((p) => (
                  <div
                    key={p.title}
                    className="grid grid-cols-[24px_1fr] gap-4 rounded-xl border border-line bg-surface px-[22px] py-5"
                  >
                    <span className="mt-0.5 grid size-[22px] place-items-center rounded-full border-[1.5px] border-lime">
                      <span className="size-[7px] rounded-full bg-lime" />
                    </span>
                    <div>
                      <h3 className="mb-1 text-[15.5px] font-bold text-ink">{p.title}</h3>
                      <p className="text-[14.5px] leading-relaxed text-ink-muted">{p.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 06 — Independent By Design */}
            <section id="independent" className="mt-14 scroll-mt-24 border-t border-line pt-14">
              <SectionHead n="06">Independent By Design</SectionHead>
              <Lede>HoodMap doesn&apos;t answer to the chain it watches — that&apos;s the point.</Lede>
              <Body>
                Everything you see is built from public, on-chain activity anyone could verify
                themselves — HoodMap just does the work of organizing it. No backroom access, no
                special data feed, no bias to protect. That independence is what makes the read
                trustworthy: a HoodScore has no reason to be anything other than honest.
              </Body>
              <Body>
                To be precise about it: HoodMap is not built, operated, or endorsed by Robinhood
                Markets, Inc. It&apos;s a separate project, watching a public chain the same way
                anyone else could.
              </Body>
            </section>

            {/* 07 — What's Next */}
            <section id="next" className="mt-14 scroll-mt-24 border-t border-line pt-14">
              <SectionHead n="07">What&apos;s Next</SectionHead>
              <Lede>HoodMap is early, and it&apos;s built in the open, iterating in public.</Lede>
              <Body>
                Coverage keeps widening, scoring keeps getting sharper, and there are more ways to
                read a wallet&apos;s story still to come. The direction is always the same: less
                noise, more signal, one chain.
              </Body>
            </section>

            {/* closing statement */}
            <div className="mt-14 border-t border-line pb-2 pt-14 text-center">
              <p className="inline-flex items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-lime">
                <span className="size-1.5 rounded-full bg-lime shadow-[0_0_10px_2px_rgba(214,250,77,0.6)]" />
                HoodMap
              </p>
              <h2 className="mx-auto mt-5 max-w-[18ch] font-display text-[1.7rem] font-bold leading-[1.15] sm:text-[2.6rem]">
                Less noise.
                <br />
                More <span className="text-lime">signal</span>.
                <br />
                One chain.
              </h2>
            </div>
          </div>
        </div>
      </div>

      <Footerdemo />
    </main>
  );
}
