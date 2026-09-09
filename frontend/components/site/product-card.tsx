import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProductCardProps {
  icon: LucideIcon;
  name: string;
  status: "live" | "soon";
  blurb: string;
  className?: string;
}

export function ProductCard({ icon: Icon, name, status, blurb, className }: ProductCardProps) {
  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 rounded-2xl border border-line bg-surface/60 p-5 transition-colors hover:border-line-strong",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex size-11 items-center justify-center rounded-xl border border-line-strong bg-surface-2 text-lime transition-colors group-hover:shadow-glow-lime-sm">
          <Icon className="size-5" />
        </span>
        <span
          className={cn(
            "font-mono text-[11px] uppercase tracking-widest",
            status === "live" ? "text-moss-soft" : "text-ink-faint"
          )}
        >
          {status === "live" ? "● live" : "in progress"}
        </span>
      </div>
      <div>
        <h3 className="font-display text-xl font-semibold text-ink">{name}</h3>
        <p className="mt-2 text-[16px] leading-relaxed text-ink-muted">{blurb}</p>
      </div>
    </div>
  );
}
