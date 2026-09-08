import { test } from "node:test";
import assert from "node:assert/strict";
import { mapWithConcurrency } from "./concurrency.js";

test("preserves input order regardless of completion order", async () => {
  const input = [30, 10, 20, 5];
  const out = await mapWithConcurrency(input, 2, async (ms) => {
    await new Promise((r) => setTimeout(r, ms));
    return ms * 2;
  });
  assert.deepEqual(out, [60, 20, 40, 10]);
});

test("never exceeds the concurrency limit", async () => {
  let inFlight = 0;
  let peak = 0;
  await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
  });
  assert.ok(peak <= 4, `peak concurrency ${peak} exceeded 4`);
});

test("handles an empty list", async () => {
  const out = await mapWithConcurrency([], 4, async () => 1);
  assert.deepEqual(out, []);
});

test("rejects if any task rejects", async () => {
  await assert.rejects(
    mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    })
  );
});
