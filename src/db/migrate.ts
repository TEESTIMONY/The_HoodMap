/**
 * Minimal forward-only migration runner. No external tooling (psql,
 * node-pg-migrate) required, so it runs identically on a laptop and on
 * Railway. Applies every `*.sql` file in `migrations/` in lexical order,
 * once, each inside its own transaction, recording applied files in
 * `schema_migrations`.
 *
 *   npm run migrate        # apply everything pending
 *   npm run migrate:status # list applied / pending without changing anything
 */
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config } from "../config/index.js";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");

async function listMigrationFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries.filter((f) => f.endsWith(".sql")).sort();
}

async function ensureRegistry(client: pg.Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedSet(client: pg.Client): Promise<Set<string>> {
  const { rows } = await client.query<{ filename: string }>("SELECT filename FROM schema_migrations");
  return new Set(rows.map((r) => r.filename));
}

async function run(statusOnly: boolean): Promise<void> {
  const client = new pg.Client({ connectionString: config.DATABASE_URL });
  await client.connect();
  try {
    await ensureRegistry(client);
    const files = await listMigrationFiles();
    const applied = await appliedSet(client);
    const pending = files.filter((f) => !applied.has(f));

    if (statusOnly) {
      for (const f of files) {
        // eslint-disable-next-line no-console
        console.log(`${applied.has(f) ? "applied " : "PENDING "} ${f}`);
      }
      return;
    }

    if (pending.length === 0) {
      // eslint-disable-next-line no-console
      console.log("no pending migrations");
      return;
    }

    for (const filename of pending) {
      const sql = await readFile(join(MIGRATIONS_DIR, filename), "utf8");
      // eslint-disable-next-line no-console
      console.log(`applying ${filename} ...`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`migration ${filename} failed: ${(err as Error).message}`);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`applied ${pending.length} migration(s)`);
  } finally {
    await client.end();
  }
}

run(process.argv.includes("--status")).catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
