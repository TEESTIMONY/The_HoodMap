import type { Hex } from "viem";

/**
 * The contract between the decode pass and per-AMM-version decoders.
 *
 * One `AmmDecoder` handles every DEX that shares an event layout — Uniswap V2
 * and its forks, Uniswap V3 and its forks, etc. The decode pass never touches
 * a specific venue's ABI; adding a fork that reuses the layout costs nothing,
 * and a genuinely new layout (V4's singleton PoolManager, say) is a new decoder.
 */

/** Transaction-level context attached to every log we decode. A DEX `Swap`'s
 *  `sender`/`recipient` is almost always a router — wallet analytics need the
 *  EOA, which only lives on the transaction. */
export interface TxContext {
  txFrom: Hex;
  txHash: Hex;
  blockNumber: bigint;
  timestamp: number; // unix seconds
}

export interface KnownPool {
  address: Hex;
  /** uniswap_v2 | uniswap_v3 | uniswap_v2_fork | uniswap_v3_fork */
  dex: string;
  poolType: "v2" | "v3";
  token0: Hex;
  token1: Hex;
  feeTier: number | null;
  factory: Hex | null;
}

export interface DecodedSwap {
  poolAddress: Hex;
  /** Resolved EOA (TxContext.txFrom), not the router. */
  walletAddress: Hex;
  sender: Hex;
  recipient: Hex;
  tokenIn: Hex;
  tokenOut: Hex;
  amountIn: bigint;
  amountOut: bigint;
  txHash: Hex;
  logIndex: number;
  blockNumber: bigint;
  timestamp: number;
}

export interface DecodedLiquidityEvent {
  poolAddress: Hex;
  walletAddress: Hex;
  eventType: "add" | "remove";
  amount0: bigint;
  amount1: bigint;
  txHash: Hex;
  logIndex: number;
  blockNumber: bigint;
  timestamp: number;
}

export interface RawLogInput {
  address: Hex;
  topics: readonly Hex[];
  data: Hex;
  logIndex: number;
}

export interface AmmDecoder {
  readonly version: "v2" | "v3";
  readonly swapTopic0: Hex;
  readonly addLiquidityTopic0: Hex;
  readonly removeLiquidityTopic0: Hex;
  decodeSwap(log: RawLogInput, pool: KnownPool, ctx: TxContext): DecodedSwap | null;
  decodeLiquidity(log: RawLogInput, pool: KnownPool, ctx: TxContext): DecodedLiquidityEvent | null;
}
