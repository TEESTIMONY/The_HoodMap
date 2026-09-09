import { hexToString, parseAbi, type Hex } from "viem";
import { httpClient } from "../indexer/rpcClient.js";
import { contracts } from "../dex/contracts.js";

const STRING_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
]);
// Some legacy tokens (MKR-era) return bytes32 for name/symbol.
const BYTES32_ABI = parseAbi([
  "function name() view returns (bytes32)",
  "function symbol() view returns (bytes32)",
]);

export interface TokenMetadata {
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  totalSupply: bigint | null;
  /** false when even decimals() didn't resolve — probably not an ERC-20. */
  looksLikeToken: boolean;
}

function clean(s: string, max: number): string | null {
  // Keep printable chars only — bytes32-padded strings carry trailing NULs and
  // hostile tokens smuggle control chars into name/symbol.
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x20 && code !== 0x7f) out += ch;
  }
  out = out.trim();
  return out ? out.slice(0, max) : null;
}

function decodeBytes32(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("0x")) return null;
  try {
    return clean(hexToString(value as Hex, { size: 32 }), 255);
  } catch {
    return null;
  }
}

/**
 * Reads ERC-20 metadata in one multicall (falls back to individual calls if
 * the chain has no Multicall3). Every field is best-effort — a token that
 * reverts on `name()` still gets discovered with whatever resolved.
 */
export async function fetchTokenMetadata(address: Hex): Promise<TokenMetadata> {
  const calls = (["name", "symbol", "decimals", "totalSupply"] as const).map((functionName) => ({
    address,
    abi: STRING_ABI,
    functionName,
  }));

  let results: { status: "success" | "failure"; result?: unknown }[];
  try {
    results = (await httpClient.multicall({
      contracts: calls,
      allowFailure: true,
      multicallAddress: contracts.multicall3,
    })) as typeof results;
  } catch {
    results = await Promise.all(
      calls.map(async (c) => {
        try {
          return { status: "success" as const, result: await httpClient.readContract(c) };
        } catch {
          return { status: "failure" as const };
        }
      })
    );
  }

  const [name, symbol, decimals, totalSupply] = results;
  let outName = name.status === "success" ? clean(String(name.result), 255) : null;
  let outSymbol = symbol.status === "success" ? clean(String(symbol.result), 100) : null;

  // bytes32 fallback for name/symbol
  if ((!outName || !outSymbol) && decimals.status === "success") {
    try {
      const b32 = await httpClient.multicall({
        contracts: [
          { address, abi: BYTES32_ABI, functionName: "name" },
          { address, abi: BYTES32_ABI, functionName: "symbol" },
        ],
        allowFailure: true,
        multicallAddress: contracts.multicall3,
      });
      if (!outName && b32[0].status === "success") outName = decodeBytes32(b32[0].result);
      if (!outSymbol && b32[1].status === "success") outSymbol = decodeBytes32(b32[1].result);
    } catch {
      /* leave as null */
    }
  }

  return {
    name: outName,
    symbol: outSymbol,
    decimals: decimals.status === "success" ? Number(decimals.result) : null,
    totalSupply: totalSupply.status === "success" ? (totalSupply.result as bigint) : null,
    looksLikeToken: decimals.status === "success",
  };
}
