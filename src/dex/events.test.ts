import { test } from "node:test";
import assert from "node:assert/strict";
import { toEventSelector } from "viem";
import {
  ERC20_ABI,
  ERC20_TRANSFER_TOPIC,
  V2_SWAP_ABI,
  V2_SWAP_TOPIC,
  V2_MINT_ABI,
  V2_MINT_TOPIC,
  V2_BURN_ABI,
  V2_BURN_TOPIC,
  V2_PAIR_CREATED_ABI,
  V2_PAIR_CREATED_TOPIC,
  V3_SWAP_ABI,
  V3_SWAP_TOPIC,
  V3_MINT_ABI,
  V3_MINT_TOPIC,
  V3_BURN_ABI,
  V3_BURN_TOPIC,
  V3_POOL_CREATED_ABI,
  V3_POOL_CREATED_TOPIC,
} from "./events.js";

const cases: [string, readonly unknown[], string][] = [
  ["ERC20 Transfer", ERC20_ABI, ERC20_TRANSFER_TOPIC],
  ["V2 Swap", V2_SWAP_ABI, V2_SWAP_TOPIC],
  ["V2 Mint", V2_MINT_ABI, V2_MINT_TOPIC],
  ["V2 Burn", V2_BURN_ABI, V2_BURN_TOPIC],
  ["V2 PairCreated", V2_PAIR_CREATED_ABI, V2_PAIR_CREATED_TOPIC],
  ["V3 Swap", V3_SWAP_ABI, V3_SWAP_TOPIC],
  ["V3 Mint", V3_MINT_ABI, V3_MINT_TOPIC],
  ["V3 Burn", V3_BURN_ABI, V3_BURN_TOPIC],
  ["V3 PoolCreated", V3_POOL_CREATED_ABI, V3_POOL_CREATED_TOPIC],
];

for (const [name, abi, topic] of cases) {
  test(`${name} topic0 constant matches its ABI`, () => {
    const event = (abi as { type: string }[]).find((i) => i.type === "event");
    assert.ok(event, `${name} ABI has no event`);
    assert.equal(toEventSelector(event as never), topic);
  });
}
