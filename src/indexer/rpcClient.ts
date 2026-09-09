import { createPublicClient, http, webSocket, defineChain, type PublicClient } from "viem";
import { config } from "../config/index.js";

/**
 * NOTE on WebSockets: Robinhood's `wss://feed.*.chain.robinhood.com` is the
 * Arbitrum *sequencer feed* (a custom feed protocol), NOT a JSON-RPC endpoint.
 * `eth_subscribe`-style subscriptions need a provider WS URL
 * (e.g. Alchemy `wss://robinhood-mainnet.g.alchemy.com/v2/<key>`).
 * Set RPC_WS_URL to one of those, or leave it blank and the indexer polls.
 */

export const robinhoodChain = defineChain({
  id: config.CHAIN_ID,
  name: config.CHAIN_NAME,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [config.RPC_HTTP_URL],
      webSocket: config.RPC_WS_URL ? [config.RPC_WS_URL] : undefined,
    },
  },
});

export const httpClient: PublicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(config.RPC_HTTP_URL, {
    // one retry at the transport level; the indexer adds its own block-level backoff
    retryCount: 2,
    timeout: 20_000,
  }),
});

export const wsClient: PublicClient | null = config.RPC_WS_URL
  ? createPublicClient({ chain: robinhoodChain, transport: webSocket(config.RPC_WS_URL) })
  : null;

/**
 * Dedicated client for wide `eth_getLogs` backfill scans. Points at
 * BACKFILL_RPC_URL (the public RPC handles full-range getLogs) and falls back to
 * the primary HTTP endpoint. More retries, longer timeout — it's a batch path.
 */
export const logsClient: PublicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(config.BACKFILL_RPC_URL ?? config.RPC_HTTP_URL, {
    // A couple of transport retries for the flaky public RPC (TLS resets), but
    // the backfill loop does its own shrink-and-retry on top for range errors.
    retryCount: 2,
    retryDelay: 1_500,
    timeout: 30_000,
  }),
});
