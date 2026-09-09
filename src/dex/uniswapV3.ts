import { decodeEventLog, type Hex } from "viem";
import {
  V3_SWAP_ABI,
  V3_SWAP_TOPIC,
  V3_MINT_ABI,
  V3_MINT_TOPIC,
  V3_BURN_ABI,
  V3_BURN_TOPIC,
} from "./events.js";
import { normalizeAddress } from "../lib/address.js";
import type {
  AmmDecoder,
  DecodedLiquidityEvent,
  DecodedSwap,
  KnownPool,
  RawLogInput,
  TxContext,
} from "./adapter.js";

/**
 * Uniswap V3 layout: `Swap.amount0/amount1` are signed deltas from the pool's
 * perspective — positive = token flowed into the pool (the trader's input),
 * negative = token flowed out (the trader's output).
 */
export class UniswapV3Decoder implements AmmDecoder {
  readonly version = "v3" as const;
  readonly swapTopic0 = V3_SWAP_TOPIC as Hex;
  readonly addLiquidityTopic0 = V3_MINT_TOPIC as Hex;
  readonly removeLiquidityTopic0 = V3_BURN_TOPIC as Hex;

  decodeSwap(log: RawLogInput, pool: KnownPool, ctx: TxContext): DecodedSwap | null {
    let args: { sender: Hex; recipient: Hex; amount0: bigint; amount1: bigint };
    try {
      ({ args } = decodeEventLog({
        abi: V3_SWAP_ABI,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      }) as unknown as { args: typeof args });
    } catch {
      return null;
    }

    const zeroIn = args.amount0 > 0n;
    const amountIn = zeroIn ? args.amount0 : args.amount1;
    const amountOut = zeroIn ? -args.amount1 : -args.amount0;
    if (amountIn <= 0n || amountOut <= 0n) return null;

    return {
      poolAddress: pool.address,
      walletAddress: ctx.txFrom,
      sender: normalizeAddress(args.sender),
      recipient: normalizeAddress(args.recipient),
      tokenIn: zeroIn ? pool.token0 : pool.token1,
      tokenOut: zeroIn ? pool.token1 : pool.token0,
      amountIn,
      amountOut,
      txHash: ctx.txHash,
      logIndex: log.logIndex,
      blockNumber: ctx.blockNumber,
      timestamp: ctx.timestamp,
    };
  }

  decodeLiquidity(log: RawLogInput, pool: KnownPool, ctx: TxContext): DecodedLiquidityEvent | null {
    const isAdd = log.topics[0] === this.addLiquidityTopic0;
    let args: { amount0: bigint; amount1: bigint };
    try {
      ({ args } = decodeEventLog({
        abi: isAdd ? V3_MINT_ABI : V3_BURN_ABI,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      }) as unknown as { args: typeof args });
    } catch {
      return null;
    }
    return {
      poolAddress: pool.address,
      walletAddress: ctx.txFrom,
      eventType: isAdd ? "add" : "remove",
      amount0: args.amount0,
      amount1: args.amount1,
      txHash: ctx.txHash,
      logIndex: log.logIndex,
      blockNumber: ctx.blockNumber,
      timestamp: ctx.timestamp,
    };
  }
}
