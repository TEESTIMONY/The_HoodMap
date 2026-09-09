-- ============================================================
-- Phase 2c — Uniswap V4
-- V4 pools aren't contracts: one singleton PoolManager, pools keyed by a
-- bytes32 PoolId. We store the PoolId in `pools.address` (and swaps.pool_address
-- etc.), so those columns must widen from an address (42) to a bytes32 (66).
-- The `= lower(x)` checks still hold for 0x + 64 hex.
-- ============================================================

ALTER TABLE pools            ALTER COLUMN address      TYPE VARCHAR(66);
ALTER TABLE swaps            ALTER COLUMN pool_address TYPE VARCHAR(66);
ALTER TABLE liquidity_events ALTER COLUMN pool_address TYPE VARCHAR(66);
ALTER TABLE pair_statistics  ALTER COLUMN pool_address TYPE VARCHAR(66);

ALTER TABLE pools ADD COLUMN hooks        VARCHAR(42);
ALTER TABLE pools ADD COLUMN tick_spacing INTEGER;
ALTER TABLE pools ADD CONSTRAINT pools_hooks_lower
  CHECK (hooks IS NULL OR hooks = lower(hooks));
