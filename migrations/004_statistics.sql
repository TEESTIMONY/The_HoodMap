-- ============================================================
-- Phase 2b — precomputed token & pair statistics
-- Filled by the statistics worker (src/workers/statistics.ts) from pool
-- reserves + recent swaps. Rebuildable; never the source of truth.
-- ============================================================

ALTER TABLE token_statistics
  ADD COLUMN price_native   NUMERIC(38, 18),  -- price in WETH
  ADD COLUMN pool_count     INTEGER,
  ADD COLUMN volume_1h      NUMERIC(20, 6),
  ADD COLUMN volume_6h      NUMERIC(20, 6),
  ADD COLUMN last_trade_at  TIMESTAMPTZ,
  ADD COLUMN total_supply   NUMERIC(78, 0);   -- snapshot, for FDV without a tokens join

CREATE TABLE pair_statistics (
    chain_id       BIGINT NOT NULL,
    pool_address   VARCHAR(42) NOT NULL,
    price0_in_1    NUMERIC(38, 18),   -- token0 priced in token1
    price0_usd     NUMERIC(38, 18),
    price1_usd     NUMERIC(38, 18),
    reserve0       NUMERIC(78, 0),
    reserve1       NUMERIC(78, 0),
    liquidity_usd  NUMERIC(20, 6),
    volume_24h     NUMERIC(20, 6),
    swap_count_24h INTEGER,
    buy_count_24h  INTEGER,
    sell_count_24h INTEGER,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (chain_id, pool_address),
    CONSTRAINT pair_stats_pool_lower CHECK (pool_address = lower(pool_address))
);

CREATE INDEX idx_token_stats_volume ON token_statistics (chain_id, volume_24h DESC);
CREATE INDEX idx_pair_stats_volume  ON pair_statistics  (chain_id, volume_24h DESC);
