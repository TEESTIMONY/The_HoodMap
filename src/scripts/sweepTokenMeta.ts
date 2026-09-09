import { sweepTokenMetadata } from "../decode/entities.js";
import { pool } from "../db/pool.js";
import { logger } from "../config/logger.js";

/** Fill metadata for bare token rows left by the pool backfill. Loops until
 *  none remain. Safe to run repeatedly. */
async function main(): Promise<void> {
  let total = 0;
  for (;;) {
    const n = await sweepTokenMetadata(200);
    total += n;
    if (n > 0) logger.info({ resolved: n, total }, "token metadata sweep: batch done");
    if (n < 200) break;
  }
  logger.info({ total }, "token metadata sweep: complete");
}

main()
  .catch((err) => {
    logger.error({ err }, "token metadata sweep failed");
    process.exitCode = 1;
  })
  .finally(() => pool.end());
