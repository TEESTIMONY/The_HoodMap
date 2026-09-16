/** Env flag: set NEXT_PUBLIC_DATA_PAUSED=true to keep pages visible (nav,
 *  headlines, copy) while hiding the actual figures on /trending and /scan.
 *  Off by default. Backend keeps running untouched either way. */
export const DATA_PAUSED = process.env.NEXT_PUBLIC_DATA_PAUSED === "true";

export function DataPaused({ message }: { message?: string }) {
  return (
    <div className="mt-6 rounded-xl border border-danger/40 bg-danger/10 px-6 py-20 text-center">
      <p className="font-mono text-[11px] uppercase tracking-widest text-danger">
        Data currently unavailable
      </p>
      <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-ink-muted">
        {message ?? "We're unable to load live data right now. Please try again later."}
      </p>
    </div>
  );
}
