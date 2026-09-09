import { parseAbi } from "viem";

/**
 * Event ABIs + their topic0 selectors for the log layouts we decode.
 * The `*_TOPIC` constants are the keccak256 signatures; `events.test.ts`
 * asserts they match what viem derives from the ABI, so a bad paste fails CI.
 */

export const ERC20_ABI = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
export const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// ---- Uniswap V2 (and forks sharing the layout) ----

export const V2_SWAP_ABI = parseAbi([
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
]);
export const V2_SWAP_TOPIC =
  "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";

export const V2_MINT_ABI = parseAbi([
  "event Mint(address indexed sender, uint256 amount0, uint256 amount1)",
]);
export const V2_MINT_TOPIC =
  "0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f";

export const V2_BURN_ABI = parseAbi([
  "event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to)",
]);
export const V2_BURN_TOPIC =
  "0xdccd412f0b1252819cb1fd330b93224ca42612892bb3f4f789976e6d81936496";

// ---- Uniswap V3 (and forks sharing the layout) ----

export const V3_SWAP_ABI = parseAbi([
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
]);
export const V3_SWAP_TOPIC =
  "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";

export const V3_MINT_ABI = parseAbi([
  "event Mint(address sender, address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)",
]);
export const V3_MINT_TOPIC =
  "0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde";

export const V3_BURN_ABI = parseAbi([
  "event Burn(address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)",
]);
export const V3_BURN_TOPIC =
  "0x0c396cd989a39f4459b5fa1aed6a9a8dcdbc45908acfd67e028cd568da98982c";
