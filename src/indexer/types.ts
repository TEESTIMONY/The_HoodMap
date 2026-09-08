/**
 * Minimal structural shapes for the bits of viem's block/transaction/receipt
 * objects the indexer actually reads. Using these instead of viem's deeply
 * generic `Block<...>` / `Transaction<...>` types keeps call sites free of
 * generic-parameter friction while still being fully type-checked.
 */

export interface RawLog {
  transactionHash: `0x${string}`;
  logIndex: number;
  address: `0x${string}`;
  topics: readonly `0x${string}`[];
  data: `0x${string}`;
}

export interface RawReceipt {
  transactionHash: `0x${string}`;
  gasUsed: bigint;
  effectiveGasPrice?: bigint;
  status: "success" | "reverted";
  logs: readonly RawLog[];
}

export interface RawTransaction {
  hash: `0x${string}`;
  transactionIndex: number;
  from: `0x${string}`;
  to: `0x${string}` | null;
  value: bigint;
  input: `0x${string}`;
  nonce: number;
  gasPrice?: bigint;
}

export interface RawBlock {
  number: bigint;
  hash: `0x${string}`;
  parentHash: `0x${string}`;
  timestamp: bigint;
  transactions: readonly RawTransaction[];
}
