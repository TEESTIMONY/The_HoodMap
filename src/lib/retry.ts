export interface RetryOptions {
  /** Only errors this returns true for are retried; anything else is rethrown at once. */
  shouldRetry: (err: unknown) => boolean;
  /** Called before each wait — for logging. `attempt` is 1 for the first retry. */
  onRetry?: (err: unknown, attempt: number, waitMs: number) => void;
  baseMs?: number;
  maxMs?: number;
  // injectable so tests don't sleep for real
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

/**
 * Retries `fn` for as long as it keeps failing with a retryable error — no
 * attempt cap, capped exponential backoff with +/-25% jitter. For waiting out
 * an outage (a database restart takes a minute or two) rather than giving up;
 * a non-retryable error still fails immediately so real bugs aren't looped on.
 */
export async function retryWhile<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const base = opts.baseMs ?? 1_000;
  const max = opts.maxMs ?? 30_000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = opts.random ?? Math.random;

  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!opts.shouldRetry(err)) throw err;
      const waitMs = Math.round(Math.min(max, base * 2 ** (attempt - 1)) * (0.75 + random() * 0.5));
      opts.onRetry?.(err, attempt, waitMs);
      await sleep(waitMs);
    }
  }
}
