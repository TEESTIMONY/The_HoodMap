# Robinhood Chain Analytics — Phase 1 Foundation

Dexscreener-style market discovery + wallet PnL intelligence for Robinhood Chain
(chain ID 4663 mainnet / 46630 testnet), an Arbitrum-Orbit EVM L2.

## Stack

Node.js 20+ + TypeScript, viem, Fastify, PostgreSQL, Redis.

## What's here (Phase 1)

- `migrations/001_init.sql` — full schema: raw → normalized → derived-analytics layers
- `src/db/migrate.ts` — dependency-free forward-only migration runner (`schema_migrations` table)
- `src/indexer/` — block-by-block indexer:
  - unified catch-up + realtime cursor loop
  - reorg detection & shallow rewind (`reorg.ts`) via parent-hash comparison
  - `eth_getBlockReceipts` with a bounded per-tx fallback
  - atomic block+checkpoint writes, retry/backoff, idempotent inserts
  - graceful SIGINT/SIGTERM shutdown
- `src/db/` — Postgres pool, raw-layer persistence, indexer checkpoint repo
- `src/api/` — minimal Fastify API (health, wallet summary, wallet transactions, token summary)
- `web/index.html` — dependency-free test console served at `GET /` (health pill, wallet
  tx explorer, token lookup) for eyeballing Phase 1 output
- `src/dex/adapter.ts` — the DEX plugin interface Phase 2 implements for Uniswap V2/V3/V4 + Pleiades
- `src/lib/` — address normalization + bounded-concurrency helper
- `docker-compose.yml` — local Postgres + Redis

## Setup

```bash
cp .env.example .env       # defaults point at testnet (chain 46630)
docker compose up -d       # local postgres + redis  (skip if using Supabase)
npm install
npm run migrate            # applies migrations/*.sql once each, in order
npm run dev:indexer        # catches up from testnet tip, then follows head
npm run dev:api            # second terminal
curl localhost:3001/health
open http://localhost:3001/   # test console (wallet tx explorer + token lookup)
```

### Using Supabase instead of local Postgres

Set these three in `.env` (Redis isn't used in Phase 1):

```
DATABASE_URL=postgres://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
DATABASE_SSL=no-verify
DATABASE_POOL_MAX=5
```

Use the **Session pooler** string from Supabase → Connect (IPv4, port 5432, safe
for the indexer's transactions). Avoid the Transaction pooler (6543) and the
direct `db.<ref>.supabase.co` host (IPv6-only without the paid add-on). Then
`npm run migrate` and carry on — no `docker compose` needed.

Production: `npm run build` then `npm run start:migrate && npm run start:api`
(and `npm run start:indexer` as its own process).

## Design principles this scaffold follows

1. **RPC-independent API.** The API only reads Postgres/Redis — it never calls
   the chain on a request path.
2. **Raw data is permanent, analytics are rebuildable.** `blocks` / `transactions`
   / `transaction_logs` / `token_transfers` / `swaps` are the source of truth.
   `trades` / `positions` / `wallet_statistics` are derived and versioned
   (`pnl_engine_version`) so the PnL methodology can change without losing history.
3. **Idempotent indexing.** Every raw/normalized table has a uniqueness constraint
   (`chain_id, tx_hash, log_index` or equivalent) + `ON CONFLICT DO NOTHING`, so
   reprocessing a block never double-counts.
4. **Atomic checkpoints.** A block's rows and the `indexer_state` checkpoint move
   in one transaction; restart always resumes from `checkpoint + 1`.
5. **Reorg-aware.** Before processing block N the indexer checks block N's
   `parentHash` against the stored hash of N−1; on a mismatch it walks back to the
   common ancestor, deletes orphaned rows, and rewinds the checkpoint. Rewinds
   deeper than 20 blocks halt for manual intervention.
6. **Lower-case addresses everywhere.** Enforced by `CHECK` constraints on the raw
   + normalized layers so indexer writes and API reads always join.
7. **Confidence, not false precision.** `market_cap` is `NULL` — not
   `price × total_supply` — when circulating supply isn't known.
   `token_statistics.price_confidence` exists so the API can surface uncertainty.

## Not yet built (by design — Phase 1 only)

- DEX adapters (Uniswap V2/V3/V4, Pleiades) — `src/dex/adapter.ts` defines the
  interface; implementations are Phase 2.
- Trade reconstruction / activity classification (swap vs transfer vs bridge vs LP)
- PnL engine (average-cost basis)
- Redis caching layer for hot reads; background workers
- Frontend (Next.js)

## Known limitations

- **Native WS not wired.** `wss://feed.*.chain.robinhood.com` is the Arbitrum
  sequencer feed, not JSON-RPC. Real-time is currently poll-based
  (`INDEXER_POLL_INTERVAL_MS`). Set `RPC_WS_URL` to a provider WS (e.g. Alchemy)
  and add an `eth_subscribe` path in Phase 2.
- Token/pool/wallet discovery is not implemented, so `tokens` / `pools` stay empty
  in Phase 1; the token endpoint will 404 until Phase 2 populates them.
- `eth_getBlockReceipts` support on the target RPC is auto-detected at runtime;
  if absent the indexer falls back to bounded per-tx receipt calls (slower).

## Before going further — legal review

Robinhood Chain's Terms of Service (§5.2) prohibit using "the Services or
Robinhood Materials to develop or operate a competing product or service,"
restrict automated access ("bots, scrapers, or spiders"), and restrict use of
Robinhood's name/marks/logos. Reading the permissionless L2's on-chain data is
not "Robinhood Materials," but building the pipeline on Robinhood's own public
RPC / Blockscout / registry, and shipping under a Robinhood-adjacent brand, is in
scope. Get counsel before launch. Practical posture: third-party RPC only
(Alchemy/QuickNode as *their* customer), your own indexer, no Robinhood branding,
a visible non-affiliation disclaimer.
