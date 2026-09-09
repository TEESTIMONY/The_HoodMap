import { decodeEventLog, type Hex } from "viem";
import {
  V2_SWAP_ABI,
  V2_SWAP_TOPIC,
  V2_MINT_ABI,
  V2_MINT_TOPIC,
  V2_BURN_ABI,
  V2_BURN_TOPIC,
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

/** Uniswap V2 constant-product layout: `Swap` reports gross in/out per side. */
export class UniswapV2Decoder implements AmmDecoder {
  readonly version = "v2" as const;
  readonly swapTopic0 = V2_SWAP_TOPIC as Hex;
  readonly addLiquidityTopic0 = V2_MINT_TOPIC as Hex;
  readonly removeLiquidityTopic0 = V2_BURN_TOPIC as Hex;

  decodeSwap(log: RawLogInput, pool: KnownPool, ctx: TxContext): DecodedSwap | null {
    let args: {
      sender: Hex;
      to: Hex;
      amount0In: bigint;
      amount1In: bigint;
      amount0Out: bigint;
      amount1Out: bigint;
    };
    try {
      ({ args } = decodeEventLog({
        abi: V2_SWAP_ABI,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      }) as unknown as { args: typeof args });
    } catch {
      return null;
    }

    const zeroForOne = args.amount0In > 0n;
    const amountIn = zeroForOne ? args.amount0In : args.amount1In;
    const amountOut = zeroForOne ? args.amount1Out : args.amount0Out;
    if (amountIn === 0n && amountOut === 0n) return null;

    return {
      poolAddress: pool.address,
      walletAddress: ctx.txFrom,
      sender: normalizeAddress(args.sender),
      recipient: normalizeAddress(args.to),
      tokenIn: zeroForOne ? pool.token0 : pool.token1,
      tokenOut: zeroForOne ? pool.token1 : pool.token0,
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
        abi: isAdd ? V2_MINT_ABI : V2_BURN_ABI,
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
