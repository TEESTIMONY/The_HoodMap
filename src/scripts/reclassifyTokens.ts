/**
 * One-off backfill: apply the updated classifyToken() rules (see
 * src/decode/entities.ts) to tokens discovered before this change, so
 * existing rows aren't stuck as "unknown" forever.
 *
 *   1. Robinhood's own tokenized stocks/ETFs ("<name> • Robinhood Token")
 *      get reclassified to stock_token wherever they were caught by the
 *      old classifier (which had no name-based rule at all).
 *   2. Everything else that's still "unknown" *and* has resolved metadata
 *      (so we know it's a real, named token — not a bare placeholder row
 *      still waiting on the metadata sweep) becomes meme_token by
 *      elimination — this is a token-launch chain, not a general registry.
 *
 * Safe to re-run; every WHERE clause only touches rows that still need it.
 */
import { pool, query } from "../db/pool.js";
import { config } from "../config/index.js";
import { logger } from "../config/logger.js";

async function main() {
  const stock = await query(
    `UPDATE tokens SET token_type = 'stock_token'
      WHERE chain_id = $1 AND token_type <> 'stock_token'
        AND name ILIKE '%• Robinhood Token'`,
    [config.CHAIN_ID]
  );
  logger.info({ updated: stock.rowCount }, "reclassified Robinhood-issued stock/ETF tokens");

  const meme = await query(
    `UPDATE tokens SET token_type = 'meme_token'
      WHERE chain_id = $1 AND token_type = 'unknown' AND metadata_fetched_at IS NOT NULL`,
    [config.CHAIN_ID]
  );
  logger.info({ updated: meme.rowCount }, "reclassified remaining discovered tokens as meme_token");
}

main()
  .then(() => logger.info("reclassifyTokens complete"))
  .catch((err) => {
    logger.error({ err }, "reclassifyTokens failed");
    process.exitCode = 1;
  })
  .finally(() => pool.end());
