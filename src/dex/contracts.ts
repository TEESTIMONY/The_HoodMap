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
}

const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11" as const;

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

export function isStablecoin(address: string): boolean {
  return contracts.stablecoins.includes(address.toLowerCase() as `0x${string}`);
}

export function isWeth(address: string): boolean {
  return contracts.weth !== "0x0000000000000000000000000000000000000000" &&
    address.toLowerCase() === contracts.weth;
}
