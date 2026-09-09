import { parseAbi, type Hex } from "viem";
import { httpClient } from "../indexer/rpcClient.js";
import { contracts } from "./contracts.js";
import { normalizeAddress } from "../lib/address.js";
import type { KnownPool } from "./adapter.js";

const POOL_ABI = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
  "function factory() view returns (address)",
]);

const FACTORY_DEX: Record<string, string> = {};
if (contracts.uniswapV3Factory) FACTORY_DEX[contracts.uniswapV3Factory] = "uniswap_v3";
if (contracts.uniswapV2Factory) FACTORY_DEX[contracts.uniswapV2Factory] = "uniswap_v2";

/** Map a factory address (from `factory()` or a PairCreated/PoolCreated log) to
 *  a DEX name, falling back to `uniswap_v{2,3}_fork` for unknown factories. */
export function dexForFactory(factory: string | null, version: "v2" | "v3"): string {
  const known = factory ? FACTORY_DEX[factory.toLowerCase()] : undefined;
  return known ?? (version === "v3" ? "uniswap_v3_fork" : "uniswap_v2_fork");
}

/**
 * Given a contract that just emitted a V2/V3-shaped `Swap`, confirm it's an AMM
 * pool and classify it. Uniswap V2 and V3 pools both expose `token0()`/`token1()`;
 * only V3 has `fee()`. `factory()` (when present) pins the exact venue —
 * everything else falls back to `*_fork`.
 *
 * Returns null for anything that isn't a pool (reverts on token0/token1).
 */
export async function identifyPool(address: Hex): Promise<KnownPool | null> {
  const calls = (["token0", "token1", "fee", "factory"] as const).map((functionName) => ({
    address,
    abi: POOL_ABI,
    functionName,
  }));

  let res: { status: "success" | "failure"; result?: unknown }[];
  try {
    res = (await httpClient.multicall({
      contracts: calls,
      allowFailure: true,
      multicallAddress: contracts.multicall3,
    })) as typeof res;
  } catch {
    return null;
  }

  const [t0, t1, fee, factory] = res;
  if (t0.status !== "success" || t1.status !== "success") return null;

  const isV3 = fee.status === "success";
  const factoryAddr =
    factory.status === "success" ? normalizeAddress(factory.result as string) : null;

  return {
    address: normalizeAddress(address),
    dex: dexForFactory(factoryAddr, isV3 ? "v3" : "v2"),
    poolType: isV3 ? "v3" : "v2",
    token0: normalizeAddress(t0.result as string),
    token1: normalizeAddress(t1.result as string),
    feeTier: isV3 && fee.status === "success" ? Number(fee.result) : null,
    factory: factoryAddr,
  };
}
