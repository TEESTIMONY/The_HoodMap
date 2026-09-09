import { config } from "../config/index.js";

/**
 * Per-chain canonical contract addresses. Everything is stored lower-case to
 * match `lib/address` normalization used everywhere else.
 *
 * Sources (Robinhood Chain mainnet, chain 4663):
 *   WETH / USDG            docs.robinhood.com/chain/contracts
 *   Uniswap V3 factory     developers.uniswap.org (v3 Robinhood Chain deployments)
 *   Multicall3             canonical CREATE2 address, same on every EVM chain
 *
 * V2 factory and V4 PoolManager aren't published in the docs yet — pool
 * discovery still works without them (see `poolIdentify`), we just can't label
 * the DEX as precisely.
 */
export interface ChainContracts {
  weth: `0x${string}`;
  /** Treated as hard $1.00 anchors by the price engine. */
  stablecoins: `0x${string}`[];
  /** Preferred USD-routing tokens, most-trusted first. */
  quoteTokens: `0x${string}`[];
  multicall3: `0x${string}`;
  uniswapV2Factory?: `0x${string}`;
  uniswapV3Factory?: `0x${string}`;
  uniswapV4PoolManager?: `0x${string}`;
  uniswapV4StateView?: `0x${string}`;
  uniswapV4PositionManager?: `0x${string}`;
}

const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11" as const;

/** V4 uses address(0) for native ETH. We treat native-ETH positions as WETH for
 *  pricing (the value difference is nil). */
export const NATIVE_ETH = "0x0000000000000000000000000000000000000000" as const;

const WETH_4663 = "0x0bd7d308f8e1639fab988df18a8011f41eacad73" as const;
const USDG_4663 = "0x5fc5360d0400a0fd4f2af552add042d716f1d168" as const;

const BY_CHAIN: Record<number, ChainContracts> = {
  // Robinhood Chain mainnet
  4663: {
    weth: WETH_4663,
    stablecoins: [USDG_4663],
    quoteTokens: [USDG_4663, WETH_4663],
    multicall3: MULTICALL3,
    uniswapV3Factory: "0x1f7d7550b1b028f7571e69a784071f0205fd2efa",
    uniswapV4PoolManager: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
    uniswapV4StateView: "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b",
    uniswapV4PositionManager: "0x58daec3116aae6d93017baaea7749052e8a04fa7",
  },
  // Robinhood Chain testnet — DEX addresses unknown; discovery is a no-op here.
  46630: {
    weth: "0x0000000000000000000000000000000000000000",
    stablecoins: [],
    quoteTokens: [],
    multicall3: MULTICALL3,
  },
};

export const contracts: ChainContracts = BY_CHAIN[config.CHAIN_ID] ?? BY_CHAIN[4663];

/** Factories we can enumerate directly (address-filtered getLogs). Fork DEXes
 *  whose factory we don't know are still found by live + lazy discovery. */
export function knownFactories(): { address: `0x${string}`; version: "v2" | "v3" }[] {
  const out: { address: `0x${string}`; version: "v2" | "v3" }[] = [];
  if (contracts.uniswapV3Factory) out.push({ address: contracts.uniswapV3Factory, version: "v3" });
  if (contracts.uniswapV2Factory) out.push({ address: contracts.uniswapV2Factory, version: "v2" });
  return out;
}

export function isStablecoin(address: string): boolean {
  return contracts.stablecoins.includes(address.toLowerCase() as `0x${string}`);
}

export function isWeth(address: string): boolean {
  const a = address.toLowerCase();
  return (a === contracts.weth && contracts.weth !== NATIVE_ETH) || a === NATIVE_ETH;
}

/** Map V4's native-ETH sentinel to WETH so it flows through the token tables
 *  and price engine like any other token. */
export function canonicalToken(address: string): `0x${string}` {
  const a = address.toLowerCase() as `0x${string}`;
  return a === NATIVE_ETH ? contracts.weth : a;
}
