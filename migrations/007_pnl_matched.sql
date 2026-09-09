-- ============================================================
-- Phase 3a — matched vs unmatched PnL
-- Forward-only indexing means we miss buys that happened before we started (or
-- tokens that arrived by transfer/airdrop). Selling / holding those looks like
-- pure profit. We split it out rather than present it as certain.
-- ============================================================

ALTER TABLE wallet_statistics
  ADD COLUMN unmatched_pnl       NUMERIC(20, 6),
  ADD COLUMN zero_cost_positions INTEGER NOT NULL DEFAULT 0;

ALTER TABLE positions
  ADD COLUMN realized_matched   NUMERIC(20, 6) NOT NULL DEFAULT 0,
  ADD COLUMN realized_unmatched NUMERIC(20, 6) NOT NULL DEFAULT 0,
  ADD COLUMN has_cost_basis     BOOLEAN NOT NULL DEFAULT false;
