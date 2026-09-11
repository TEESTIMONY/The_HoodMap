"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Modal({
  title,
  onClose,
  children,
  size = "default",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** "full" for content that wants the whole viewport, e.g. the bubble map */
  size?: "default" | "full";
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-canvas/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex w-full flex-col overflow-hidden rounded-lg border border-line-strong bg-surface shadow-[0_40px_120px_-24px_rgba(0,0,0,0.9)]",
          size === "full" ? "h-[92vh] max-w-[96vw]" : "max-h-[90vh] max-w-4xl"
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-mono text-[13px] uppercase tracking-wide text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-faint transition-colors hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
        <div
          className={cn(
            "min-h-0 flex-1",
            size === "full" ? "flex flex-col overflow-hidden p-2.5" : "overflow-auto p-3"
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
