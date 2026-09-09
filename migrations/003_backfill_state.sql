-- ============================================================
-- Phase 2a+ — backfill cursors
-- Tracks how far each historical scan (e.g. factory pool enumeration) has
-- progressed, so restarts resume instead of re-scanning from genesis.
-- ============================================================

CREATE TABLE backfill_state (
    chain_id   BIGINT NOT NULL,
    kind       VARCHAR(50) NOT NULL,
    last_block BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (chain_id, kind)
);
