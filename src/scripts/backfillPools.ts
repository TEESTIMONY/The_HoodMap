import { backfillPools } from "../dex/backfillPools.js";
import { pool } from "../db/pool.js";
import { logger } from "../config/logger.js";

backfillPools()
  .then((r) => {
    logger.info(r, "pool backfill complete");
  })
  .catch((err) => {
    logger.error({ err }, "pool backfill failed");
    process.exitCode = 1;
  })
  .finally(() => pool.end());
