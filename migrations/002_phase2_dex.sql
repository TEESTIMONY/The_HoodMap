-- ============================================================
-- Phase 2a — DEX decode support
--   * token discovery bookkeeping
--   * pool factory attribution
--   * composite indexes the swap/transfer aggregations need
-- ============================================================

ALTER TABLE tokens ADD COLUMN metadata_fetched_at TIMESTAMPTZ;
ALTER TABLE tokens ADD COLUMN discovery_failed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE pools ADD COLUMN factory VARCHAR(42);
ALTER TABLE pools ADD CONSTRAINT pools_factory_lower
  CHECK (factory IS NULL OR factory = lower(factory));

CREATE INDEX idx_swaps_pool_time     ON swaps (pool_address, timestamp DESC);
CREATE INDEX idx_swaps_token_in_time  ON swaps (token_in, timestamp DESC);
CREATE INDEX idx_swaps_token_out_time ON swaps (token_out, timestamp DESC);
CREATE INDEX idx_transfers_token_time ON token_transfers (token_address, timestamp DESC);
CREATE INDEX idx_pools_token_pair     ON pools (token0, token1);
