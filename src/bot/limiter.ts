/**
 * Concurrency primitives for the bot. Pure (no I/O) so they're unit-testable.
 *
 * The bot shares a 1GB VM with the indexer, API and stats worker, and a single
 * wallet lookup can run for seconds. Under a burst of users we need to:
 *   - cap how many API calls run at once (createLimiter),
 *   - shed load instead of queueing forever (BusyError),
 *   - not repeat identical work: fifty people scanning the same token should
 *     cost one API call, not fifty (createCoalescer).
 */

/** Thrown when the queue is full or a request waited too long for a slot. */
export class BusyError extends Error {
  constructor(message = "busy") {
    super(message);
    this.name = "BusyError";
  }
}

export interface LimiterOptions {
  /** How many tasks may run at the same time. */
  concurrency: number;
  /** How many may wait for a slot; beyond this, run() rejects immediately. */
  maxQueue: number;
  /** How long a queued task may wait for a slot before being shed. */
  maxWaitMs: number;
}

export function createLimiter(opts: LimiterOptions) {
  let active = 0;
  const queue: { start: () => void; timer: ReturnType<typeof setTimeout> }[] = [];

  function drain(): void {
    while (active < opts.concurrency && queue.length > 0) {
      const next = queue.shift()!;
      clearTimeout(next.timer);
      next.start();
    }
  }

  return {
    /** Run `fn` when a slot is free. FIFO. Rejects with BusyError if shed. */
    run<T>(fn: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        // Release the slot *before* settling the caller, so whatever the caller
        // does next (e.g. another run()) sees an accurate count.
        const release = (): void => {
          active--;
          drain();
        };
        const start = (): void => {
          active++;
          Promise.resolve()
            .then(fn)
            .then(
              (value) => {
                release();
                resolve(value);
              },
              (err) => {
                release();
                reject(err);
              }
            );
        };

        if (active < opts.concurrency) return start();
        if (queue.length >= opts.maxQueue) return reject(new BusyError("queue full"));

        const entry = {
          start,
          timer: setTimeout(() => {
            const i = queue.indexOf(entry);
            if (i !== -1) queue.splice(i, 1);
            reject(new BusyError("waited too long"));
          }, opts.maxWaitMs),
        };
        queue.push(entry);
      });
    },
    stats: () => ({ active, queued: queue.length }),
  };
}

/**
 * Coalesces concurrent identical requests into one and briefly caches the
 * result. Callers asking for the same key while one is in flight share its
 * promise (they don't take a limiter slot at all). Results are cached for
 * `ttlMs` only when `shouldCache` says so — failures and 5xxs are never cached,
 * so a blip doesn't get remembered.
 */
export function createCoalescer(maxEntries = 500) {
  const inflight = new Map<string, Promise<unknown>>();
  const cache = new Map<string, { at: number; value: unknown }>();

  return {
    get<T>(
      key: string,
      ttlMs: number,
      fn: () => Promise<T>,
      shouldCache: (value: T) => boolean = () => true,
      now: () => number = Date.now
    ): Promise<T> {
      const hit = cache.get(key);
      if (hit && now() - hit.at < ttlMs) return Promise.resolve(hit.value as T);

      const pending = inflight.get(key);
      if (pending) return pending as Promise<T>;

      const p = Promise.resolve()
        .then(fn)
        .then((value) => {
          if (shouldCache(value)) {
            cache.delete(key); // re-insert so Map order stays oldest-first
            cache.set(key, { at: now(), value });
            while (cache.size > maxEntries) cache.delete(cache.keys().next().value as string);
          }
          return value;
        });
      inflight.set(key, p);
      const clear = (): void => {
        inflight.delete(key);
      };
      p.then(clear, clear);
      return p;
    },
    stats: () => ({ inflight: inflight.size, cached: cache.size }),
  };
}
