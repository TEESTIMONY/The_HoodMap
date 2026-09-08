import type pg from "pg";
import { config } from "../config/index.js";

/**
 * Shared node-postgres connection options so the long-lived pool and the
 * one-shot migration client agree on how to connect.
 *
 * DATABASE_SSL:
 *   "disable"   – local docker / plaintext (default)
 *   "require"   – TLS, verify the server certificate chain
 *   "no-verify" – TLS, don't verify (Supabase pooler, most managed PG)
 */
export function pgConnectionConfig(): pg.ClientConfig {
  const ssl =
    config.DATABASE_SSL === "require"
      ? true
      : config.DATABASE_SSL === "no-verify"
        ? { rejectUnauthorized: false }
        : undefined;
  return { connectionString: config.DATABASE_URL, ssl };
}
