import { decodeEventLog, parseAbi, slice, type Hex } from "viem";
import {
  V4_INITIALIZE_ABI,
  V4_INITIALIZE_TOPIC,
  V4_MODIFY_LIQUIDITY_ABI,
  V4_MODIFY_LIQUIDITY_TOPIC,
  V4_SWAP_ABI,
  V4_SWAP_TOPIC,
} from "./events.js";
import { canonicalToken, contracts } from "./contracts.js";
import { normalizeAddress } from "../lib/address.js";
import { httpClient } from "../indexer/rpcClient.js";
import type {
  AmmDecoder,
  DecodedLiquidityEvent,
  DecodedSwap,
  KnownPool,
  RawLogInput,
  TxContext,
} from "./adapter.js";

/**
 * Uniswap V4. Pools live inside the singleton PoolManager and are keyed by a
 * bytes32 PoolId (topic1 of every event). currency0 = address(0) is native ETH,
 * which we canonicalise to WETH. `Swap.amount{0,1}` are signed pool deltas —
 * positive = into the pool (trader input), same convention as V3.
 */
export class UniswapV4Decoder implements AmmDecoder {
  readonly version = "v3" as const; // shares the signed-delta swap shape
  readonly swapTopic0 = V4_SWAP_TOPIC as Hex;
  readonly addLiquidityTopic0 = V4_MODIFY_LIQUIDITY_TOPIC as Hex;
  readonly removeLiquidityTopic0 = V4_MODIFY_LIQUIDITY_TOPIC as Hex;

  decodeSwap(log: RawLogInput, pool: KnownPool, ctx: TxContext): DecodedSwap | null {
    let args: { sender: Hex; amount0: bigint; amount1: bigint };
    try {
      ({ args } = decodeEventLog({
        abi: V4_SWAP_ABI,
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
      recipient: ctx.txFrom,
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
    let args: { liquidityDelta: bigint };
    try {
      ({ args } = decodeEventLog({
        abi: V4_MODIFY_LIQUIDITY_ABI,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      }) as unknown as { args: typeof args });
    } catch {
      return null;
    }
    if (args.liquidityDelta === 0n) return null;
    return {
      poolAddress: pool.address,
      walletAddress: ctx.txFrom,
      eventType: args.liquidityDelta > 0n ? "add" : "remove",
      // V4 ModifyLiquidity reports a liquidity delta, not token amounts.
      amount0: 0n,
      amount1: 0n,
      txHash: ctx.txHash,
      logIndex: log.logIndex,
      blockNumber: ctx.blockNumber,
      timestamp: ctx.timestamp,
    };
  }
}

/** Parse a V4 `Initialize` log into a KnownPool (address = PoolId). */
export function parseV4Initialize(log: RawLogInput): KnownPool | null {
  if (log.topics[0] !== V4_INITIALIZE_TOPIC) return null;
  let args: {
    id: Hex;
    currency0: Hex;
    currency1: Hex;
    fee: number;
    tickSpacing: number;
    hooks: Hex;
  };
  try {
    ({ args } = decodeEventLog({
      abi: V4_INITIALIZE_ABI,
      data: log.data,
      topics: log.topics as [Hex, ...Hex[]],
    }) as unknown as { args: typeof args });
  } catch {
    return null;
  }
  return {
    address: args.id.toLowerCase() as Hex,
    dex: "uniswap_v4",
    poolType: "v4",
    token0: canonicalToken(args.currency0),
    token1: canonicalToken(args.currency1),
    feeTier: Number(args.fee),
    factory: contracts.uniswapV4PoolManager ?? null,
    hooks: normalizeAddress(args.hooks),
    tickSpacing: Number(args.tickSpacing),
  };
}

const POSITION_MANAGER_ABI = parseAbi([
  "function poolKeys(bytes25 poolId) view returns (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)",
]);

/**
 * Lazily resolve a V4 pool we never saw initialised, via
 * `PositionManager.poolKeys(bytes25(poolId))`. Returns null if unavailable.
 */
export async function fetchV4PoolKey(poolId: Hex): Promise<KnownPool | null> {
  const pm = contracts.uniswapV4PositionManager;
  if (!pm) return null;
  try {
    const key = (await httpClient.readContract({
      address: pm,
      abi: POSITION_MANAGER_ABI,
      functionName: "poolKeys",
      args: [slice(poolId, 0, 25)],
    })) as [Hex, Hex, number, number, Hex];
    const [currency0, currency1, fee, tickSpacing, hooks] = key;
    if (currency0 === currency1) return null;
    return {
      address: poolId.toLowerCase() as Hex,
      dex: "uniswap_v4",
      poolType: "v4",
      token0: canonicalToken(currency0),
      token1: canonicalToken(currency1),
      feeTier: Number(fee),
      factory: contracts.uniswapV4PoolManager ?? null,
      hooks: normalizeAddress(hooks),
      tickSpacing: Number(tickSpacing),
    };
  } catch {
    return null;
  }
}
