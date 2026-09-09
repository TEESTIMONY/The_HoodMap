import { cn } from "@/lib/utils";

/**
 * HoodMap mark — a network graph in the shape of an H (five ring-nodes: four
 * corners + a hub), an almost-closed scan ring, and a feather breaking the ring
 * on the left (the Robinhood nod, the only organic shape). Lime line-art.
 */
export function HoodMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      className={cn("text-lime", className)}
      aria-hidden
    >
      {/* almost-closed scan ring */}
      <path
        d="M14 6.5 A 19 19 0 1 1 13 41.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* H edges */}
      <path
        d="M16 15 V33 M32 15 V33 M16 24 H32"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* ring-nodes: 4 corners + hub */}
      {[
        [16, 15],
        [16, 33],
        [32, 15],
        [32, 33],
        [24, 24],
      ].map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={i === 4 ? 3.4 : 2.8}
          fill="#06070a"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      ))}
      {/* feather breaking the ring on the left */}
      <path
        d="M9 20 q5 4 4.5 9 q-4 -0.5 -6 -3.5 q0.6 -3.6 1.5 -5.5 Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path d="M11 21.5 q1.6 3 1.2 6.4" stroke="#06070a" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export function HoodWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <HoodMark className="size-9 shrink-0" />
      <span className="font-display text-[22px] font-semibold text-ink">
        Hood<span className="text-lime">Map</span>
      </span>
    </span>
  );
}
