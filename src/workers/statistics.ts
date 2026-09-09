import { refreshStatistics } from "../analytics/statistics.js";
import { pool } from "../db/pool.js";
import { logger } from "../config/logger.js";
import { config } from "../config/index.js";

const INTERVAL_MS = 45_000;
let running = true;

async function tick(): Promise<void> {
  const started = Date.now();
  try {
    const r = await refreshStatistics();
    logger.info({ ...r, ms: Date.now() - started }, "statistics refreshed");
  } catch (err) {
    logger.error({ err: (err as Error).message }, "statistics refresh failed");
  }
}

async function main(): Promise<void> {
  logger.info({ chainId: config.CHAIN_ID, intervalMs: INTERVAL_MS }, "statistics worker starting");
  while (running) {
    await tick();
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

function shutdown(sig: string): void {
  logger.info({ sig }, "statistics worker stopping");
  running = false;
  void pool.end().finally(() => process.exit(0));
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch((err) => {
  logger.error({ err }, "statistics worker crashed");
  process.exit(1);
});
