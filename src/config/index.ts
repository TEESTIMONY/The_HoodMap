import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  CHAIN_ID: z.coerce.number().int().positive(),
  CHAIN_NAME: z.string(),
  RPC_HTTP_URL: z.string().url(),
  RPC_WS_URL: z.string().optional().default(""),
  // Used only for wide eth_getLogs scans (factory/pool backfill). The public
  // Robinhood RPC allows full-range getLogs (10k-result cap) where Alchemy's
  // free tier caps at a 10-block range. Falls back to RPC_HTTP_URL.
  BACKFILL_RPC_URL: z.string().url().optional(),
  BLOCKSCOUT_API_URL: z.string().url().optional(),
  DATABASE_URL: z.string(),
  DATABASE_SSL: z.enum(["disable", "require", "no-verify"]).default("disable"),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  // Unused in Phase 1 (no caching layer yet); optional so Supabase-only setups
  // don't need a Redis instance to boot.
  REDIS_URL: z.string().optional().default(""),
  INDEXER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  // How many blocks ahead of the commit cursor to fetch concurrently. The
  // indexer was latency-bound (one round trip at a time) well under most
  // RPC providers' actual rate-limit ceiling — raising this overlaps request
  // latency instead of waiting on it serially. Tune down if the RPC provider
  // 429s persistently even after the rate-limit backoff; tune up if CPU/DB
  // are idle while blocks queue up waiting to fetch.
  INDEXER_FETCH_CONCURRENCY: z.coerce.number().int().positive().default(10),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(60),
  LOG_LEVEL: z.string().default("info"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
