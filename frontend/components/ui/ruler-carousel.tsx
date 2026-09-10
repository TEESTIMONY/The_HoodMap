"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Rewind, FastForward } from "lucide-react";

export interface CarouselItem {
  id: number;
  /** the large word shown on the ruler */
  title: string;
  /** the plain-language framing shown under the ruler */
  heading?: string;
  body?: string;
}

interface InfiniteItem extends CarouselItem {
  key: string;
  originalIndex: number;
}

const ITEM_WIDTH = 480;
const GAP = 120;
const SLOT = ITEM_WIDTH + GAP;

function createInfiniteItems(items: CarouselItem[]): InfiniteItem[] {
  const out: InfiniteItem[] = [];
  for (let copy = 0; copy < 3; copy++) {
    items.forEach((item, index) => {
      out.push({ ...item, key: `${copy}-${item.id}`, originalIndex: index });
    });
  }
  return out;
}

function RulerLines({ top = true, totalLines = 61 }: { top?: boolean; totalLines?: number }) {
  const spacing = 100 / (totalLines - 1);
  const center = Math.floor(totalLines / 2);
  return (
    <div className="relative h-10 w-full px-4">
      {Array.from({ length: totalLines }, (_, i) => {
        const isCenter = i === center;
        const isFifth = i % 5 === 0;
        const height = isCenter ? "h-10" : isFifth ? "h-5" : "h-3";
        const color = isCenter ? "bg-lime" : "bg-ink-faint";
        return (
          <div
            key={i}
            className={`absolute w-px ${height} ${color} ${top ? "" : "bottom-0"}`}
            style={{ left: `${i * spacing}%`, opacity: isCenter ? 1 : isFifth ? 0.7 : 0.35 }}
          />
        );
      })}
    </div>
  );
}

export function RulerCarousel({ items }: { items: CarouselItem[] }) {
  const reduce = useReducedMotion();
  const infinite = createInfiniteItems(items);
  const perSet = items.length;
  const mid = (infinite.length - 1) / 2;

  const [activeIndex, setActiveIndex] = useState(perSet); // first item of the middle set
  const [resetting, setResetting] = useState(false);
  const [paused, setPaused] = useState(false);
  const regionRef = useRef<HTMLDivElement>(null);

  const step = (dir: 1 | -1) => {
    if (resetting) return;
    setActiveIndex((prev) => prev + dir);
  };

  // Auto-advance, unless the reader is hovering / focused in, or reduced motion.
  useEffect(() => {
    if (reduce || paused) return;
    const id = window.setInterval(() => setActiveIndex((v) => v + 1), 3000);
    return () => window.clearInterval(id);
  }, [reduce, paused]);

  const goToOriginal = (originalIndex: number) => {
    if (resetting) return;
    const candidates = [originalIndex, originalIndex + perSet, originalIndex + perSet * 2];
    let closest = candidates[0];
    for (const c of candidates) {
      if (Math.abs(c - activeIndex) < Math.abs(closest - activeIndex)) closest = c;
    }
    setActiveIndex(closest);
  };

  // Keep the active index inside the middle set so the loop feels endless. The
  // index jump must land while `resetting` is still true (so the track snaps
  // instantly, no 3-slot slide), then spring transitions resume next frame.
  useEffect(() => {
    if (resetting) return;
    const shift = activeIndex < perSet ? perSet : activeIndex >= perSet * 2 ? -perSet : 0;
    if (!shift) return;
    setResetting(true);
    requestAnimationFrame(() => {
      setActiveIndex((v) => v + shift);
      requestAnimationFrame(() => setResetting(false));
    });
  }, [activeIndex, perSet, resetting]);

  const targetX = -(activeIndex - mid) * SLOT;
  const activeOriginal = ((activeIndex % perSet) + perSet) % perSet;
  const active = items[activeOriginal];

  const trackTransition =
    resetting || reduce
      ? { duration: 0 }
      : { type: "spring" as const, stiffness: 340, damping: 32, mass: 1 };
  const scaleTransition =
    resetting || reduce
      ? { duration: 0 }
      : { type: "spring" as const, stiffness: 400, damping: 30 };

  return (
    <div
      className="w-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        ref={regionRef}
        role="group"
        aria-roledescription="carousel"
        aria-label="What HoodMap reads off-chain"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            step(-1);
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            step(1);
          }
        }}
        className="relative flex h-[210px] flex-col justify-center rounded-2xl outline-none ring-lime/30 focus-visible:ring-2 sm:h-[300px]"
      >
        <RulerLines top />

        <div className="relative flex h-full w-full items-center justify-center overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_18%,#000_82%,transparent)]">
          <motion.div
            className="flex items-center will-change-transform"
            style={{ gap: `${GAP}px` }}
            animate={{ x: targetX }}
            transition={trackTransition}
          >
            {infinite.map((item, index) => {
              const isActive = index === activeIndex;
              return (
                <motion.button
                  key={item.key}
                  type="button"
                  onClick={() => goToOriginal(item.originalIndex)}
                  aria-current={isActive}
                  className={`flex shrink-0 items-center justify-center whitespace-nowrap font-display text-[2.5rem] font-bold uppercase tracking-[-0.01em] transition-colors sm:text-[4.25rem] ${
                    isActive ? "text-ink" : "text-ink-faint hover:text-ink-muted"
                  }`}
                  style={{ width: ITEM_WIDTH }}
                  animate={{ scale: isActive ? 1 : 0.72, opacity: isActive ? 1 : 0.35 }}
                  transition={scaleTransition}
                >
                  {item.title}
                </motion.button>
              );
            })}
          </motion.div>
        </div>

        <RulerLines top={false} />
      </div>

      {/* framing for the centred item */}
      <div className="mx-auto mt-10 max-w-xl text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeOriginal}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {active.heading && (
              <p className="font-display text-xl font-semibold text-lime">{active.heading}</p>
            )}
            {active.body && (
              <p className="mt-2.5 text-[16px] leading-relaxed text-ink-muted">{active.body}</p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* controls */}
      <div className="mt-9 flex items-center justify-center gap-6">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={resetting}
          aria-label="Previous"
          className="text-ink-muted transition-colors hover:text-lime disabled:opacity-40"
        >
          <Rewind className="size-6" strokeWidth={1.75} />
        </button>
        <div className="tabular font-mono text-[14px] text-ink-faint">
          <span className="text-ink-muted">{activeOriginal + 1}</span>
          <span className="mx-1">/</span>
          <span>{perSet}</span>
        </div>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={resetting}
          aria-label="Next"
          className="text-ink-muted transition-colors hover:text-lime disabled:opacity-40"
        >
          <FastForward className="size-6" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
