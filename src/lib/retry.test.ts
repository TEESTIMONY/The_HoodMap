import { test } from "node:test";
import assert from "node:assert/strict";
import { retryWhile } from "./retry.js";

const noSleep = async () => {};

test("returns immediately when the first attempt succeeds", async () => {
  let calls = 0;
  const out = await retryWhile(async () => (++calls, "ok"), { shouldRetry: () => true, sleep: noSleep });
  assert.equal(out, "ok");
  assert.equal(calls, 1);
});

test("keeps retrying a retryable error until it recovers (no attempt cap)", async () => {
  let calls = 0;
  const out = await retryWhile(
    async () => {
      if (++calls < 12) throw new Error("db down");
      return "back";
    },
    { shouldRetry: () => true, sleep: noSleep }
  );
  assert.equal(out, "back");
  assert.equal(calls, 12);
});

test("a non-retryable error is rethrown at once, without retrying", async () => {
  let calls = 0;
  await assert.rejects(
    retryWhile(
      async () => {
        calls++;
        throw new Error("real bug");
      },
      { shouldRetry: (e) => (e as Error).message !== "real bug", sleep: noSleep }
    ),
    /real bug/
  );
  assert.equal(calls, 1);
});

test("backs off exponentially up to the cap, with jitter applied", async () => {
  const waits: number[] = [];
  let calls = 0;
  await retryWhile(
    async () => {
      if (++calls <= 8) throw new Error("x");
    },
    {
      shouldRetry: () => true,
      baseMs: 1_000,
      maxMs: 30_000,
      random: () => 0.5, // jitter factor 0.75 + 0.5*0.5 = 1.0 -> exact values
      sleep: async (ms) => void waits.push(ms),
    }
  );
  assert.deepEqual(waits, [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
});

test("jitter stays within +/-25% of the nominal wait", async () => {
  const waits: number[] = [];
  for (const r of [0, 1]) {
    let calls = 0;
    await retryWhile(async () => { if (++calls === 1) throw new Error("x"); }, {
      shouldRetry: () => true, baseMs: 1000, random: () => r, sleep: async (ms) => void waits.push(ms),
    });
  }
  assert.deepEqual(waits, [750, 1250]);
});

test("onRetry reports the attempt number and the wait", async () => {
  const seen: Array<[number, number]> = [];
  let calls = 0;
  await retryWhile(async () => { if (++calls <= 2) throw new Error("x"); }, {
    shouldRetry: () => true, random: () => 0.5, sleep: noSleep,
    onRetry: (_e, attempt, waitMs) => seen.push([attempt, waitMs]),
  });
  assert.deepEqual(seen, [[1, 1000], [2, 2000]]);
});
