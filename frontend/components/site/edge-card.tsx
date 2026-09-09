import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EdgeCardProps {
  side: "left" | "right";
  icon: LucideIcon;
  eyebrow: string;
  primary: string;
  secondary: string;
  className?: string;
}

/**
 * The half-clipped glass stat panels that float at the viewport edges
 * (as in the reference layout). Hidden below lg.
 */
export function EdgeCard({ side, icon: Icon, eyebrow, primary, secondary, className }: EdgeCardProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute top-1/2 z-20 hidden w-[250px] -translate-y-1/2 xl:block",
        side === "left" ? "left-0 -translate-x-[7%]" : "right-0 translate-x-[7%]",
        className
      )}
    >
      <div className="rounded-2xl border border-line-strong bg-surface/70 p-4 backdrop-blur-xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface-2 text-lime">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-mono text-[10px] uppercase tracking-widest text-ink-faint">
              {eyebrow}
            </p>
            <p className="tabular truncate font-mono text-[15px] font-semibold text-ink">{primary}</p>
          </div>
        </div>
        <div className="mt-3 border-t border-line pt-3">
          <p className="tabular truncate font-mono text-[11px] text-ink-muted">{secondary}</p>
        </div>
      </div>
    </div>
  );
}
