import type { Log } from "viem";

/**
 * Context the indexer supplies alongside each log. A DEX `Swap` event's
 * `sender`/`recipient` is almost always a router, not the trader — wallet
 * analytics need the actual EOA, which only lives on the transaction.
 */
export interface LogContext {
  /** `transaction.from` — the EOA that submitted the tx. */
  txFrom: `0x${string}`;
  txHash: `0x${string}`;
  blockNumber: bigint;
  timestamp: number;
}

export interface DecodedSwap {
  poolAddress: `0x${string}`;
  /** Resolved EOA (from LogContext.txFrom), not the router. */
  walletAddress: `0x${string}`;
  /** Raw event participants, kept for auditing / router attribution. */
  sender: `0x${string}`;
  recipient: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: bigint;
  amountOut: bigint;
  txHash: `0x${string}`;
  logIndex: number;
  blockNumber: bigint;
}

export interface DecodedLiquidityEvent {
  poolAddress: `0x${string}`;
  walletAddress: `0x${string}`;
  eventType: "add" | "remove";
  amount0: bigint;
  amount1: bigint;
  txHash: `0x${string}`;
  logIndex: number;
  blockNumber: bigint;
}

export interface PoolInfo {
  address: `0x${string}`;
  token0: `0x${string}`;
  token1: `0x${string}`;
  feeTier?: number;
  poolType: string;
}

/**
 * Every supported DEX (Uniswap V2/V3/V4, Pleiades, future venues) implements
 * this interface. The indexer/analytics engine only ever talks to this
 * interface — never to a specific DEX's ABI directly — so adding a new
 * venue never requires touching the core pipeline.
 */
export interface DexAdapter {
  readonly name: string;

  /** Topic0 signatures this adapter cares about, so the log router can dispatch to it. */
  readonly watchedTopics: `0x${string}`[];

  /** Given raw pool-creation logs, return newly discovered pools for this DEX. */
  discoverPools(logs: Log[]): Promise<PoolInfo[]>;

  /** Decode a raw swap log into a normalized swap, or null if this log isn't one of ours. */
  decodeSwap(log: Log, ctx: LogContext): Promise<DecodedSwap | null>;

  /** Decode a raw liquidity log into a normalized event, or null if not applicable. */
  decodeLiquidityEvent(log: Log, ctx: LogContext): Promise<DecodedLiquidityEvent | null>;
}
