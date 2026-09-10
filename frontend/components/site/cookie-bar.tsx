"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cookie } from "lucide-react";

const KEY = "hoodmap.cookie-consent";

export function CookieBar() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      setShow(true);
    }
  }, []);

  const close = (value: "accepted" | "declined") => {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      /* private mode — just dismiss for the session */
    }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="flex w-full max-w-3xl items-center gap-4 rounded-2xl border border-line-strong bg-canvas/90 p-3 pl-4 shadow-[0_24px_70px_-28px_rgba(0,0,0,0.95)] backdrop-blur-xl sm:gap-5">
        <span className="hidden size-9 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-lime sm:grid">
          <Cookie className="size-4" />
        </span>
        <p className="flex-1 text-[12px] leading-relaxed text-ink-muted">
          We use cookies for functional and analytics purposes. See our{" "}
          <Link href="/privacy" className="text-ink underline underline-offset-2 hover:text-lime">
            Privacy Policy
          </Link>{" "}
          for details.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => close("declined")}
            className="rounded-full border border-line-strong px-4 py-2 font-mono text-[12px] text-ink-muted transition-colors hover:text-ink"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => close("accepted")}
            className="rounded-full bg-lime px-4 py-2 font-mono text-[12px] font-semibold text-canvas transition-shadow hover:shadow-glow-lime-sm"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
