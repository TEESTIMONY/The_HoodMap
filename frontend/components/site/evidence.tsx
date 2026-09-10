import { HoodMark } from "@/components/site/logo";

/**
 * A calm, centred "this is the voice" panel: the mark over a shallow arc, a
 * sample finding stated one line at a time, then the readout line. Wrapped in
 * a faint bounding frame with corner nodes (a contained terminal readout),
 * echoing the reference layout.
 */
export function Evidence() {
  return (
    <section className="px-5 py-24 sm:py-28">
      <div className="relative mx-auto max-w-3xl">
        {/* shallow arc behind the mark */}
        <svg
          aria-hidden
          viewBox="0 0 1600 320"
          fill="none"
          preserveAspectRatio="none"
          className="pointer-events-none absolute left-1/2 top-[-52px] h-[320px] w-[1600px] max-w-[176%] -translate-x-1/2 text-line-strong"
        >
          <path d="M0 320 Q 800 -140 1600 320" stroke="currentColor" strokeWidth="1" strokeOpacity="0.6" />
        </svg>

        {/* framed readout */}
        <div className="relative rounded-[2rem] border border-line/50 px-6 py-12 sm:px-10 sm:py-16">
          <span className="absolute -left-1.5 -top-1.5 size-3 rounded-full border border-line-strong bg-canvas" />
          <span className="absolute -right-1.5 -top-1.5 size-3 rounded-full border border-line-strong bg-canvas" />
          <span className="absolute -bottom-1.5 -left-1.5 size-3 rounded-full border border-line-strong bg-canvas" />
          <span className="absolute -bottom-1.5 -right-1.5 size-3 rounded-full border border-line-strong bg-canvas" />

          <div className="relative flex flex-col items-center text-center">
            <div className="relative">
              <div className="absolute inset-0 -z-10 rounded-2xl bg-lime/20 blur-xl" />
              <div className="grid size-16 place-items-center rounded-2xl border border-line-strong bg-surface-2">
                <HoodMark className="size-8" />
              </div>
            </div>

            <p className="mt-8 font-mono text-[12px] text-ink-faint">How HoodMap states a finding</p>

            <div className="mt-5 max-w-2xl font-display text-[1.2rem] font-normal leading-[1.5] text-ink sm:text-[1.7rem]">
              <span className="block">
                <span className="text-lime">3 wallet clusters</span> control{" "}
                <span className="text-lime">41%</span> of supply.
              </span>
              <span className="block">
                Top cluster funded from <span className="text-lime">one address</span>.
              </span>
              <span className="block">LP not locked.</span>
            </div>

            <p className="mt-6 font-mono text-[13px] text-ink-faint">
              HoodScore <span className="text-warning">C</span> · reasons attached, derived from
              on-chain transfer history.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
