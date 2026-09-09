/**
 * `npm run db:analyze` — refresh planner statistics. Run this after a big
 * backfill: `pools` / `tokens` grow from tens of thousands to hundreds of
 * thousands of rows, and stale stats make the API's join queries pick bad plans
 * (symptom: "canceling statement due to statement timeout").
 */
import "dotenv/config";
import pg from "pg";

const sslMode = process.env.DATABASE_SSL ?? "disable";
const ssl =
  sslMode === "require" ? true : sslMode === "no-verify" ? { rejectUnauthorized: false } : undefined;

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl,
  connectionTimeoutMillis: 20_000,
});
await client.connect();
await client.query("SET statement_timeout = 0");

const tables = [
  "pools",
  "tokens",
  "swaps",
  "transactions",
  "token_transfers",
  "pair_statistics",
  "token_statistics",
  "positions",
  "trades",
  "wallet_statistics",
];
console.log(`analyzing ${tables.length} tables…`);
await client.query(`ANALYZE ${tables.join(", ")}`);
console.log("done");
await client.end();
