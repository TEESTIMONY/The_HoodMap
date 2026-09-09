-- ============================================================
-- Phase 3a — wallet PnL / trade reconstruction
-- Richer columns on the (already-present) trades / positions / wallet_statistics
-- tables. All rebuildable from swaps; versioned by pnl_engine_version.
-- ============================================================

ALTER TABLE positions
  ADD COLUMN current_price   NUMERIC(38, 18),
  ADD COLUMN current_value   NUMERIC(20, 6),
  ADD COLUMN is_open         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN buy_usd         NUMERIC(20, 6) NOT NULL DEFAULT 0,
  ADD COLUMN sell_usd        NUMERIC(20, 6) NOT NULL DEFAULT 0,
  ADD COLUMN first_buy_at    TIMESTAMPTZ,
  ADD COLUMN last_activity_at TIMESTAMPTZ,
  ADD COLUMN pnl_engine_version VARCHAR(20) NOT NULL DEFAULT '1.0';

ALTER TABLE wallet_statistics
  ADD COLUMN roi              NUMERIC(12, 4),
  ADD COLUMN buy_volume       NUMERIC(20, 6),
  ADD COLUMN sell_volume      NUMERIC(20, 6),
  ADD COLUMN tokens_traded    INTEGER,
  ADD COLUMN open_positions   INTEGER,
  ADD COLUMN closed_positions INTEGER,
  ADD COLUMN first_trade_at   TIMESTAMPTZ,
  ADD COLUMN last_trade_at    TIMESTAMPTZ,
  ADD COLUMN avg_holding_hours NUMERIC(14, 2),
  ADD COLUMN breakeven_trades INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN pnl_confidence   VARCHAR(10) DEFAULT 'medium',
  ADD COLUMN computed_at      TIMESTAMPTZ;

CREATE INDEX idx_positions_wallet_open ON positions (chain_id, wallet_address, is_open);
