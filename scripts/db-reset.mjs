/**
 * `npm run db:reset` — truncates every data table (keeping the schema and the
 * `schema_migrations` ledger). For switching chains or clearing a bad index run
 * during development. Reads DATABASE_URL / DATABASE_SSL from .env.
 */
import "dotenv/config";
import pg from "pg";

const sslMode = process.env.DATABASE_SSL ?? "disable";
const ssl =
  sslMode === "require" ? true : sslMode === "no-verify" ? { rejectUnauthorized: false } : undefined;

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl });
await client.connect();

const { rows } = await client.query(
  `SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> 'schema_migrations'
    ORDER BY tablename`
);
const tables = rows.map((r) => r.tablename);

if (tables.length === 0) {
  console.log("no data tables found — run `npm run migrate` first");
} else {
  const list = tables.map((t) => `"${t}"`).join(", ");
  await client.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  console.log(`truncated ${tables.length} tables: ${tables.join(", ")}`);
}

await client.end();
