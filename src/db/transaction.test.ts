import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { PoolClient } from "pg";
import { runInTransaction } from "./transaction.js";
import { isTransientDbError } from "./errors.js";

/** A stand-in for a pg client that records every statement and how it was released. */
class FakeClient extends EventEmitter {
  statements: string[] = [];
  released: { called: boolean; arg?: unknown } = { called: false };
  failOn = new Map<string, Error>();

  async query(sql: string): Promise<unknown> {
    this.statements.push(sql);
    const err = this.failOn.get(sql);
    if (err) throw err;
    return { rows: [] };
  }
  release(arg?: unknown): void {
    this.released = { called: true, arg };
  }
}

function source(client: FakeClient) {
  return { connect: async () => client as unknown as PoolClient };
}

const dropped = () => new Error("Connection terminated unexpectedly");

test("happy path: BEGIN, work, COMMIT, healthy release", async () => {
  const c = new FakeClient();
  const out = await runInTransaction(source(c), async (cl) => {
    await cl.query("INSERT 1");
    return "done";
  });
  assert.equal(out, "done");
  assert.deepEqual(c.statements, ["BEGIN", "INSERT 1", "COMMIT"]);
  assert.equal(c.released.called, true);
  assert.equal(c.released.arg, undefined, "a healthy client is recycled, not destroyed");
  assert.equal(c.listenerCount("error"), 0, "our error listener is removed afterwards");
});

test("a normal query error rolls back and keeps the client", async () => {
  const c = new FakeClient();
  c.failOn.set("INSERT dup", Object.assign(new Error("duplicate key value"), { code: "23505" }));
  await assert.rejects(
    runInTransaction(source(c), (cl) => cl.query("INSERT dup")),
    /duplicate key/
  );
  assert.deepEqual(c.statements, ["BEGIN", "INSERT dup", "ROLLBACK"]);
  assert.equal(c.released.arg, undefined, "a constraint error doesn't poison the connection");
});

test("REGRESSION: a connection drop mid-transaction is not an unhandled 'error' event", async () => {
  const c = new FakeClient();
  // EventEmitter throws when 'error' is emitted with no listener — exactly how the
  // real process died. If runInTransaction holds a listener, this doesn't throw.
  await assert.rejects(
    runInTransaction(source(c), async (cl) => {
      (cl as unknown as EventEmitter).emit("error", dropped());
      throw dropped(); // the in-flight query rejects too, as in pg
    }),
    /Connection terminated unexpectedly/
  );
});

test("a dead connection skips ROLLBACK and is destroyed, not returned to the pool", async () => {
  const c = new FakeClient();
  await assert.rejects(
    runInTransaction(source(c), async (cl) => {
      (cl as unknown as EventEmitter).emit("error", dropped());
      throw dropped();
    })
  );
  assert.ok(!c.statements.includes("ROLLBACK"), "ROLLBACK on a dead socket would throw or hang");
  assert.ok(c.released.arg instanceof Error, "release(err) evicts the client from the pool");
});

test("a connection error surfaced only by the query (no 'error' event) also destroys the client", async () => {
  const c = new FakeClient();
  c.failOn.set("INSERT x", dropped());
  await assert.rejects(runInTransaction(source(c), (cl) => cl.query("INSERT x")), /Connection terminated/);
  assert.ok(!c.statements.includes("ROLLBACK"));
  assert.ok(c.released.arg instanceof Error);
});

test("a failing ROLLBACK doesn't mask the original error, and the client is destroyed", async () => {
  const c = new FakeClient();
  c.failOn.set("INSERT bad", new Error("syntax error at or near INSERT"));
  c.failOn.set("ROLLBACK", new Error("rollback exploded"));
  await assert.rejects(
    runInTransaction(source(c), (cl) => cl.query("INSERT bad")),
    /syntax error/,
    "the caller sees the real failure, not the rollback's"
  );
  assert.ok(c.released.arg instanceof Error);
});

test("statement timeout is treated as a broken connection state", async () => {
  const c = new FakeClient();
  c.failOn.set("SLOW", Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" }));
  await assert.rejects(runInTransaction(source(c), (cl) => cl.query("SLOW")), /statement timeout/);
  assert.ok(c.released.arg instanceof Error);
});

test("isTransientDbError: outages yes, bugs no", () => {
  const yes = [
    new Error("Connection terminated unexpectedly"),
    new Error("terminating connection due to administrator command"),
    new Error("the database system is starting up"),
    new Error("timeout exceeded when trying to connect"),
    new Error("canceling statement due to statement timeout"),
    Object.assign(new Error("x"), { code: "57P01" }),
    Object.assign(new Error("x"), { code: "ECONNRESET" }),
    Object.assign(new Error("x"), { code: "53300" }),
  ];
  const no = [
    Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" }),
    Object.assign(new Error('relation "nope" does not exist'), { code: "42P01" }),
    new Error("syntax error at or near"),
    new Error("HTTP request failed. Status: 429"), // an RPC error, not a database one
    null,
    undefined,
    "a string",
  ];
  for (const e of yes) assert.equal(isTransientDbError(e), true, String((e as Error).message));
  for (const e of no) assert.equal(isTransientDbError(e), false, String((e as Error | null)?.message ?? e));
});
