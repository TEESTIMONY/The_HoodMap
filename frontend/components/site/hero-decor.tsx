/**
 * Faint scattered fragments behind the hero — the on-chain maths the product
 * actually runs on (sqrt-price, deltas, cluster share), echoing the equations
 * in the reference layout. Purely decorative.
 */
const FRAGMENTS: {
  text: string;
  className: string;
  size: string;
  rotate: string;
}[] = [
  { text: "√P", className: "left-[6%] top-[26%]", size: "text-4xl", rotate: "-rotate-12" },
  { text: "Δ +41%", className: "left-[12%] top-[64%]", size: "text-xl", rotate: "rotate-6" },
  { text: "0x7f…a3", className: "left-[3%] top-[46%]", size: "text-sm", rotate: "-rotate-3" },
  { text: "n · √P", className: "right-[8%] top-[30%]", size: "text-2xl", rotate: "rotate-12" },
  { text: "sqrtPriceX96", className: "right-[4%] top-[58%]", size: "text-xs", rotate: "-rotate-6" },
  { text: "24", className: "left-[20%] top-[80%]", size: "text-5xl", rotate: "rotate-3" },
  { text: "−15 + 6", className: "left-[30%] top-[16%]", size: "text-lg", rotate: "-rotate-6" },
  { text: "∑ wᵢ", className: "right-[22%] top-[78%]", size: "text-3xl", rotate: "rotate-6" },
  { text: "P&L", className: "right-[30%] top-[14%]", size: "text-2xl", rotate: "-rotate-12" },
  { text: "√", className: "right-[14%] top-[46%]", size: "text-6xl", rotate: "rotate-0" },
];

export function HeroDecor() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 select-none overflow-hidden font-mono text-ink"
    >
      {FRAGMENTS.map((f, i) => (
        <span
          key={i}
          className={`absolute ${f.className} ${f.size} ${f.rotate}`}
          style={{ opacity: 0.06 }}
        >
          {f.text}
        </span>
      ))}
    </div>
  );
}
