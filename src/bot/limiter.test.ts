import { test } from "node:test";
import assert from "node:assert/strict";
import { BusyError, createCoalescer, createLimiter } from "./limiter.js";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

test("limiter never runs more than `concurrency` tasks at once", async () => {
  const lim = createLimiter({ concurrency: 3, maxQueue: 100, maxWaitMs: 5_000 });
  let running = 0;
  let peak = 0;
  const task = async () => {
    running++;
    peak = Math.max(peak, running);
    await sleep(15);
    running--;
  };
  await Promise.all(Array.from({ length: 20 }, () => lim.run(task)));
  assert.equal(peak, 3);
  assert.deepEqual(lim.stats(), { active: 0, queued: 0 });
});

test("limiter starts queued tasks in FIFO order", async () => {
  const lim = createLimiter({ concurrency: 1, maxQueue: 10, maxWaitMs: 5_000 });
  const order: number[] = [];
  await Promise.all([1, 2, 3, 4].map((n) => lim.run(async () => { await sleep(5); order.push(n); })));
  assert.deepEqual(order, [1, 2, 3, 4]);
});

test("limiter sheds with BusyError once the queue is full", async () => {
  const lim = createLimiter({ concurrency: 1, maxQueue: 2, maxWaitMs: 5_000 });
  const results = await Promise.allSettled(
    Array.from({ length: 6 }, () => lim.run(() => sleep(20)))
  );
  // 1 running + 2 queued are admitted; the other 3 are shed immediately
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 3);
  const shed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  assert.equal(shed.length, 3);
  assert.ok(shed.every((r) => r.reason instanceof BusyError));
});

test("limiter sheds a task that waits longer than maxWaitMs, without stalling the rest", async () => {
  const lim = createLimiter({ concurrency: 1, maxQueue: 10, maxWaitMs: 30 });
  const slow = lim.run(() => sleep(120));
  const waiting = lim.run(async () => "never");
  await assert.rejects(waiting, BusyError);
  await slow;
  // the timed-out entry must be gone from the queue, and the limiter still works
  assert.deepEqual(lim.stats(), { active: 0, queued: 0 });
  assert.equal(await lim.run(async () => "ok"), "ok");
});

test("limiter frees the slot when a task throws", async () => {
  const lim = createLimiter({ concurrency: 1, maxQueue: 10, maxWaitMs: 5_000 });
  await assert.rejects(lim.run(async () => { throw new Error("boom"); }), /boom/);
  await assert.rejects(lim.run(() => { throw new Error("sync boom"); }), /sync boom/);
  assert.equal(await lim.run(async () => 42), 42);
  assert.deepEqual(lim.stats(), { active: 0, queued: 0 });
});

test("coalescer runs one call for concurrent identical keys", async () => {
  const c = createCoalescer();
  let calls = 0;
  const fn = async () => {
    calls++;
    await sleep(20);
    return "v";
  };
  const out = await Promise.all(Array.from({ length: 50 }, () => c.get("k", 1_000, fn)));
  assert.equal(calls, 1);
  assert.ok(out.every((v) => v === "v"));
});

test("coalescer runs different keys in parallel", async () => {
  const c = createCoalescer();
  let calls = 0;
  const fn = async () => {
    calls++;
    await sleep(10);
    return calls;
  };
  await Promise.all([c.get("a", 1_000, fn), c.get("b", 1_000, fn), c.get("c", 1_000, fn)]);
  assert.equal(calls, 3);
});

test("coalescer serves from cache within the ttl and refetches after it", async () => {
  const c = createCoalescer();
  let clock = 1_000;
  const now = () => clock;
  let calls = 0;
  const fn = async () => ++calls;
  assert.equal(await c.get("k", 500, fn, () => true, now), 1);
  clock += 400;
  assert.equal(await c.get("k", 500, fn, () => true, now), 1, "still fresh");
  clock += 200;
  assert.equal(await c.get("k", 500, fn, () => true, now), 2, "expired -> refetched");
});

test("coalescer never caches failures or results shouldCache rejects", async () => {
  const c = createCoalescer();
  let calls = 0;
  await assert.rejects(c.get("f", 1_000, async () => { calls++; throw new Error("x"); }), /x/);
  await assert.rejects(c.get("f", 1_000, async () => { calls++; throw new Error("x"); }), /x/);
  assert.equal(calls, 2, "a failure is not remembered");

  let n = 0;
  const notCached = () => c.get("s", 1_000, async () => ({ status: 503, n: ++n }), (v) => v.status < 500);
  assert.equal((await notCached()).n, 1);
  assert.equal((await notCached()).n, 2, "5xx-style result is not cached");
  assert.deepEqual(c.stats(), { inflight: 0, cached: 0 });
});

test("coalescer shares a failure with everyone waiting on it, then recovers", async () => {
  const c = createCoalescer();
  let calls = 0;
  const failing = async () => {
    calls++;
    await sleep(15);
    throw new Error("upstream down");
  };
  const waiters = await Promise.allSettled(Array.from({ length: 10 }, () => c.get("k", 1_000, failing)));
  assert.equal(calls, 1);
  assert.ok(waiters.every((w) => w.status === "rejected"));
  assert.equal(await c.get("k", 1_000, async () => "back"), "back");
});

test("coalescer evicts the oldest entries beyond maxEntries", async () => {
  const c = createCoalescer(3);
  for (const k of ["a", "b", "c", "d", "e"]) await c.get(k, 60_000, async () => k);
  assert.equal(c.stats().cached, 3);
  let refetched = false;
  await c.get("a", 60_000, async () => { refetched = true; return "a"; });
  assert.ok(refetched, "the oldest entry was evicted");
});
