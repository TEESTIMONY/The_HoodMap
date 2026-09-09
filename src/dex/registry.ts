import { UniswapV2Decoder } from "./uniswapV2.js";
import { UniswapV3Decoder } from "./uniswapV3.js";
import type { AmmDecoder } from "./adapter.js";

export const ammDecoders: readonly AmmDecoder[] = [
  new UniswapV2Decoder(),
  new UniswapV3Decoder(),
];

const bySwapTopic = new Map<string, AmmDecoder>();
const byLiquidityTopic = new Map<string, { decoder: AmmDecoder; type: "add" | "remove" }>();

for (const d of ammDecoders) {
  bySwapTopic.set(d.swapTopic0, d);
  byLiquidityTopic.set(d.addLiquidityTopic0, { decoder: d, type: "add" });
  byLiquidityTopic.set(d.removeLiquidityTopic0, { decoder: d, type: "remove" });
}

/** All topic0s any decoder cares about — used to pre-filter block logs. */
export const watchedSwapTopics: ReadonlySet<string> = new Set(bySwapTopic.keys());
export const watchedLiquidityTopics: ReadonlySet<string> = new Set(byLiquidityTopic.keys());

export function swapDecoderForTopic(topic0: string | undefined): AmmDecoder | undefined {
  return topic0 ? bySwapTopic.get(topic0) : undefined;
}

export function liquidityDecoderForTopic(
  topic0: string | undefined
): { decoder: AmmDecoder; type: "add" | "remove" } | undefined {
  return topic0 ? byLiquidityTopic.get(topic0) : undefined;
}
