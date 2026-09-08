-- ============================================================
-- Robinhood Chain Analytics — Initial schema
-- Layers: RAW -> NORMALIZED -> DERIVED/ANALYTICS
--
-- Conventions:
--   * All addresses are stored LOWER-CASE (enforced by CHECK on the
--     raw + normalized layers) so indexer writes and API reads always join.
--   * Every raw/normalized row carries enough chain coordinates
--     (chain_id, block_number, block_hash, tx_hash, log_index) to be
--     traced back to source and to support reorg rollback.
--   * Uniqueness constraints make every write idempotent.
-- ============================================================

-- ---------- Indexer bookkeeping ----------

CREATE TABLE indexer_state (
    chain_id BIGINT PRIMARY KEY,
    last_processed_block BIGINT NOT NULL DEFAULT 0,
    last_processed_hash VARCHAR(66),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- RAW layer ----------

CREATE TABLE blocks (
    id BIGSERIAL PRIMARY KEY,
    chain_id BIGINT NOT NULL,
    block_number BIGINT NOT NULL,
    block_hash VARCHAR(66) NOT NULL,
    parent_hash VARCHAR(66),
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (chain_id, block_number),
    UNIQUE (chain_id, block_hash)
);
CREATE INDEX idx_blocks_timestamp ON blocks (timestamp);

CREATE TABLE transactions (
    id BIGSERIAL PRIMARY KEY,
    chain_id BIGINT NOT NULL,
    hash VARCHAR(66) NOT NULL,
    block_number BIGINT NOT NULL,
    block_hash VARCHAR(66) NOT NULL,
    transaction_index INTEGER,
    from_address VARCHAR(42) NOT NULL,
    to_address VARCHAR(42),
    value NUMERIC(78, 0) NOT NULL DEFAULT 0,
    input TEXT,
    nonce BIGINT,
    gas_used BIGINT,
    gas_price NUMERIC(78, 0),
    status SMALLINT,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (chain_id, hash),
    CONSTRAINT transactions_from_lower CHECK (from_address = lower(from_address)),
    CONSTRAINT transactions_to_lower CHECK (to_address IS NULL OR to_address = lower(to_address))
);
CREATE INDEX idx_transactions_from ON transactions (from_address);
CREATE INDEX idx_transactions_to ON transactions (to_address);
CREATE INDEX idx_transactions_block ON transactions (block_number);

CREATE TABLE transaction_logs (
    id BIGSERIAL PRIMARY KEY,
    chain_id BIGINT NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL,
    log_index INTEGER NOT NULL,
    address VARCHAR(42) NOT NULL,
    topic0 VARCHAR(66),
    topic1 VARCHAR(66),
    topic2 VARCHAR(66),
    topic3 VARCHAR(66),
    data TEXT,
    block_number BIGINT NOT NULL,
    block_hash VARCHAR(66) NOT NULL,
    decoded BOOLEAN NOT NULL DEFAULT false,
    event_name VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (chain_id, transaction_hash, log_index),
    CONSTRAINT logs_address_lower CHECK (address = lower(address))
);
CREATE INDEX idx_logs_address ON transaction_logs (address);
CREATE INDEX idx_logs_topic0 ON transaction_logs (topic0);
CREATE INDEX idx_logs_block ON transaction_logs (block_number);

-- ---------- NORMALIZED layer ----------

CREATE TABLE tokens (
    id BIGSERIAL PRIMARY KEY,
    chain_id BIGINT NOT NULL,
    address VARCHAR(42) NOT NULL,
    name VARCHAR(255),
    symbol VARCHAR(100),
    decimals INTEGER,
    total_supply NUMERIC(78, 0),
    token_type VARCHAR(50) DEFAULT 'unknown', -- native/wrapped_native/stablecoin/stock_token/etf_token/defi_token/meme_token/lp_token/unknown
    verified BOOLEAN NOT NULL DEFAULT false,
    logo_url TEXT,
    created_block BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (chain_id, address),
    CONSTRAINT tokens_address_lower CHECK (address = lower(address))
);
CREATE INDEX idx_tokens_symbol ON tokens (symbol);

CREATE TABLE pools (
    id BIGSERIAL PRIMARY KEY,
    chain_id BIGINT NOT NULL,
    address VARCHAR(42) NOT NULL,
    dex VARCHAR(100) NOT NULL,        -- uniswap_v2 / uniswap_v3 / uniswap_v4 / pleiades / ...
    pool_type VARCHAR(50),
    token0 VARCHAR(42) NOT NULL,
    token1 VARCHAR(42) NOT NULL,
    fee_tier NUMERIC,
    created_block BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (chain_id, address),
    CONSTRAINT pools_address_lower CHECK (address = lower(address)),
    CONSTRAINT pools_token0_lower CHECK (token0 = lower(token0)),
    CONSTRAINT pools_token1_lower CHECK (token1 = lower(token1))
);
CREATE INDEX idx_pools_token0 ON pools (token0);
CREATE INDEX idx_pools_token1 ON pools (token1);
CREATE INDEX idx_pools_dex ON pools (dex);

CREATE TABLE wallets (
    id BIGSERIAL PRIMARY KEY,
    chain_id BIGINT NOT NULL,
    address VARCHAR(42) NOT NULL,
    first_seen_block BIGINT,
    last_seen_block BIGINT,
    first_seen_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ,
    label VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (chain_id, address),
    CONSTRAINT wallets_address_lower CHECK (address = lower(address))
);

CREATE TABLE token_transfers (
    id BIGSERIAL PRIMARY KEY,
    chain_id BIGINT NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL,
    log_index INTEGER NOT NULL,
    token_address VARCHAR(42) NOT NULL,
    from_address VARCHAR(42) NOT NULL,
    to_address VARCHAR(42) NOT NULL,
    amount NUMERIC(78, 0) NOT NULL,
    block_number BIGINT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    -- classification: swap / transfer / bridge / lp_add / lp_remove / stake / unstake / mint / burn / unknown
    activity_type VARCHAR(30) NOT NULL DEFAULT 'unknown',
    UNIQUE (chain_id, transaction_hash, log_index),
    CONSTRAINT transfers_token_lower CHECK (token_address = lower(token_address)),
    CONSTRAINT transfers_from_lower CHECK (from_address = lower(from_address)),
    CONSTRAINT transfers_to_lower CHECK (to_address = lower(to_address))
);
CREATE INDEX idx_transfers_token ON token_transfers (token_address);
CREATE INDEX idx_transfers_from ON token_transfers (from_address);
CREATE INDEX idx_transfers_to ON token_transfers (to_address);
CREATE INDEX idx_transfers_timestamp ON token_transfers (timestamp);

CREATE TABLE swaps (
    id BIGSERIAL PRIMARY KEY,
    chain_id BIGINT NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL,
    log_index INTEGER NOT NULL,
    pool_address VARCHAR(42) NOT NULL,
    dex VARCHAR(100) NOT NULL,
    wallet_address VARCHAR(42) NOT NULL,  -- resolved EOA (tx.from), not the router
    token_in VARCHAR(42) NOT NULL,
    token_out VARCHAR(42) NOT NULL,
    amount_in NUMERIC(78, 0) NOT NULL,
    amount_out NUMERIC(78, 0) NOT NULL,
    usd_value NUMERIC(20, 6),
    price NUMERIC(38, 18),
    block_number BIGINT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    UNIQUE (chain_id, transaction_hash, log_index),
    CONSTRAINT swaps_pool_lower CHECK (pool_address = lower(pool_address)),
    CONSTRAINT swaps_wallet_lower CHECK (wallet_address = lower(wallet_address)),
    CONSTRAINT swaps_token_in_lower CHECK (token_in = lower(token_in)),
    CONSTRAINT swaps_token_out_lower CHECK (token_out = lower(token_out))
);
CREATE INDEX idx_swaps_wallet ON swaps (wallet_address);
CREATE INDEX idx_swaps_pool ON swaps (pool_address);
CREATE INDEX idx_swaps_timestamp ON swaps (timestamp);

CREATE TABLE liquidity_events (
    id BIGSERIAL PRIMARY KEY,
    chain_id BIGINT NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL,
    log_index INTEGER NOT NULL,
    pool_address VARCHAR(42) NOT NULL,
    wallet_address VARCHAR(42) NOT NULL,
    event_type VARCHAR(10) NOT NULL, -- add / remove
    amount0 NUMERIC(78, 0),
    amount1 NUMERIC(78, 0),
    block_number BIGINT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    UNIQUE (chain_id, transaction_hash, log_index),
    CONSTRAINT liq_pool_lower CHECK (pool_address = lower(pool_address)),
    CONSTRAINT liq_wallet_lower CHECK (wallet_address = lower(wallet_address))
);
CREATE INDEX idx_liq_pool ON liquidity_events (pool_address);
CREATE INDEX idx_liq_wallet ON liquidity_events (wallet_address);

-- ---------- DERIVED / ANALYTICS layer ----------
-- Everything below is rebuildable from the layers above. Versioned by
-- pnl_engine_version so the methodology can change without losing history.

CREATE TABLE trades (
    id BIGSERIAL PRIMARY KEY,
    chain_id BIGINT NOT NULL,
    wallet_address VARCHAR(42) NOT NULL,
    token_address VARCHAR(42) NOT NULL,
    side VARCHAR(10) NOT NULL, -- buy / sell
    quantity NUMERIC(38, 18) NOT NULL,
    price NUMERIC(38, 18),
    usd_value NUMERIC(20, 6),
    cost_basis NUMERIC(20, 6),
    realized_pnl NUMERIC(20, 6),
    dex VARCHAR(100),
    tx_hash VARCHAR(66) NOT NULL,
    pnl_engine_version VARCHAR(20) NOT NULL DEFAULT '1.0',
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (chain_id, wallet_address, token_address, tx_hash, side, pnl_engine_version)
);
CREATE INDEX idx_trades_wallet ON trades (wallet_address);
CREATE INDEX idx_trades_token ON trades (token_address);
CREATE INDEX idx_trades_timestamp ON trades (timestamp);

CREATE TABLE positions (
    id BIGSERIAL PRIMARY KEY,
    chain_id BIGINT NOT NULL,
    wallet_address VARCHAR(42) NOT NULL,
    token_address VARCHAR(42) NOT NULL,
    quantity NUMERIC(38, 18) NOT NULL DEFAULT 0,
    average_cost NUMERIC(38, 18) NOT NULL DEFAULT 0,
    cost_basis NUMERIC(20, 6) NOT NULL DEFAULT 0,
    realized_pnl NUMERIC(20, 6) NOT NULL DEFAULT 0,
    unrealized_pnl NUMERIC(20, 6) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (chain_id, wallet_address, token_address)
);

CREATE TABLE wallet_statistics (
    chain_id BIGINT NOT NULL,
    wallet_address VARCHAR(42) NOT NULL,
    portfolio_value NUMERIC(20, 6),
    realized_pnl NUMERIC(20, 6),
    unrealized_pnl NUMERIC(20, 6),
    total_pnl NUMERIC(20, 6),
    total_trades INTEGER NOT NULL DEFAULT 0,
    winning_trades INTEGER NOT NULL DEFAULT 0,
    losing_trades INTEGER NOT NULL DEFAULT 0,
    win_rate NUMERIC(6, 4),
    total_volume NUMERIC(20, 6),
    best_trade_pnl NUMERIC(20, 6),
    worst_trade_pnl NUMERIC(20, 6),
    average_win NUMERIC(20, 6),
    average_loss NUMERIC(20, 6),
    indexed_through_block BIGINT,
    pnl_engine_version VARCHAR(20) NOT NULL DEFAULT '1.0',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (chain_id, wallet_address)
);

CREATE TABLE token_statistics (
    chain_id BIGINT NOT NULL,
    token_address VARCHAR(42) NOT NULL,
    price NUMERIC(38, 18),
    market_cap NUMERIC(24, 6),   -- NULL if circulating supply unknown; never derived from total_supply
    fdv NUMERIC(24, 6),
    liquidity_usd NUMERIC(20, 6),
    volume_24h NUMERIC(20, 6),
    buy_count_24h INTEGER,
    sell_count_24h INTEGER,
    holder_count INTEGER,
    price_confidence VARCHAR(10) DEFAULT 'low', -- high/medium/low
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (chain_id, token_address)
);

CREATE TABLE price_candles (
    id BIGSERIAL PRIMARY KEY,
    chain_id BIGINT NOT NULL,
    token_address VARCHAR(42) NOT NULL,
    candle_interval VARCHAR(5) NOT NULL, -- 1m/5m/15m/1h/4h/1d
    open_time TIMESTAMPTZ NOT NULL,
    open NUMERIC(38, 18),
    high NUMERIC(38, 18),
    low NUMERIC(38, 18),
    close NUMERIC(38, 18),
    volume NUMERIC(20, 6),
    UNIQUE (chain_id, token_address, candle_interval, open_time)
);
CREATE INDEX idx_candles_lookup ON price_candles (token_address, candle_interval, open_time);
