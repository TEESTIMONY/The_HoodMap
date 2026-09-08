import { readFile } from "node:fs/promises";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "../config/index.js";
import { logger } from "../config/logger.js";
import { pool, query } from "../db/pool.js";
import { getOrCreateIndexerState } from "../db/indexerState.js";
import { isAddress, normalizeAddress } from "../lib/address.js";

const app = Fastify({ logger: false });
await app.register(cors, { origin: true });

/** Reject bad addresses before touching the DB; 400 with a consistent shape. */
function requireAddress(raw: string): `0x${string}` {
  if (!isAddress(raw)) {
    const err = new Error("invalid_address") as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }
  return normalizeAddress(raw);
}

app.setErrorHandler((err, _req, reply) => {
  const status = (err as { statusCode?: number }).statusCode ?? 500;
  if (status >= 500) logger.error({ err }, "request failed");
  reply.status(status).send({ error: status >= 500 ? "internal_error" : err.message });
});

// Minimal Phase 1 test console. Served from the API so there's no separate
// origin / CORS story. Read per-request so editing the HTML doesn't need a restart.
const consolePath = new URL("../../web/index.html", import.meta.url);
app.get("/", async (_req, reply) => {
  const html = await readFile(consolePath, "utf8");
  return reply.type("text/html").send(html);
});

app.get("/health", async (_req, reply) => {
  try {
    const state = await getOrCreateIndexerState();
    return {
      status: "ok",
      chainId: config.CHAIN_ID,
      db: true,
      indexedThroughBlock: state.lastProcessedBlock.toString(),
    };
  } catch (err) {
    // API is up but its datastore isn't reachable — report it rather than 500,
    // so the test console can show "API up / DB down".
    logger.warn({ err }, "health check: database unreachable");
    return reply.status(503).send({ status: "degraded", chainId: config.CHAIN_ID, db: false });
  }
});

app.get<{ Params: { address: string } }>("/api/v1/wallets/:address", async (req, reply) => {
  const address = requireAddress(req.params.address);
  const result = await query(
    "SELECT * FROM wallet_statistics WHERE chain_id = $1 AND wallet_address = $2",
    [config.CHAIN_ID, address]
  );
  if (!result.rows[0]) {
    // Not "wallet doesn't exist" — just that the analytics worker (Phase 3)
    // hasn't produced a summary for it yet.
    return reply.status(404).send({ error: "not_indexed_yet" });
  }
  return result.rows[0];
});

app.get<{ Params: { address: string }; Querystring: { limit?: string; before?: string } }>(
  "/api/v1/wallets/:address/transactions",
  async (req) => {
    const address = requireAddress(req.params.address);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const before = req.query.before ? Number(req.query.before) : null;

    const result = await query(
      `SELECT hash, block_number, transaction_index, from_address, to_address,
              value, gas_used, gas_price, status, timestamp
         FROM transactions
        WHERE chain_id = $1
          AND (from_address = $2 OR to_address = $2)
          AND ($3::bigint IS NULL OR block_number < $3)
        ORDER BY block_number DESC, transaction_index DESC
        LIMIT $4`,
      [config.CHAIN_ID, address, before, limit]
    );
    return { address, count: result.rows.length, transactions: result.rows };
  }
);

app.get<{ Params: { address: string } }>("/api/v1/tokens/:address", async (req, reply) => {
  const address = requireAddress(req.params.address);
  const result = await query(
    `SELECT t.*, ts.price, ts.market_cap, ts.fdv, ts.liquidity_usd, ts.volume_24h, ts.price_confidence
       FROM tokens t
       LEFT JOIN token_statistics ts
         ON ts.token_address = t.address AND ts.chain_id = t.chain_id
      WHERE t.chain_id = $1 AND t.address = $2`,
    [config.CHAIN_ID, address]
  );
  if (!result.rows[0]) return reply.status(404).send({ error: "token_not_found" });
  return result.rows[0];
});

const server = app.listen({ port: config.API_PORT, host: "0.0.0.0" });
server
  .then((addr) => logger.info({ addr }, "API listening"))
  .catch((err) => {
    logger.error({ err }, "failed to start API");
    process.exit(1);
  });

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down API");
  await app.close().catch(() => undefined);
  await pool.end().catch(() => undefined);
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
