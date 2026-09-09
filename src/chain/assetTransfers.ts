import type { Hex } from "viem";
import { httpClient } from "../indexer/rpcClient.js";

export interface AssetTransfer {
  hash: string;
  blockNum: number;
  category: string;
  /** unix seconds */
  timestamp: number;
  /** native-ETH value moved (0 for pure token transfers) */
  ethValue: number;
}

interface RawTransfer {
  hash: string;
  blockNum: string;
  category: string;
  value: number | null;
  asset: string | null;
  metadata: { blockTimestamp: string };
}

/**
 * Every ERC-20 + native transfer touching `address`, newest first, via Alchemy's
 * `alchemy_getAssetTransfers`. Paginated; `maxPages` per direction bounds the
 * work for very active wallets.
 */
export async function getWalletTransfers(
  address: string,
  maxPages = 5,
  fromBlock = 0
): Promise<AssetTransfer[]> {
  const out: AssetTransfer[] = [];
  const fromBlockHex = `0x${fromBlock.toString(16)}`;

  for (const dir of ["fromAddress", "toAddress"] as const) {
    let pageKey: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const res = (await httpClient.request({
        method: "alchemy_getAssetTransfers" as never,
        params: [
          {
            fromBlock: fromBlockHex,
            toBlock: "latest",
            [dir]: address,
            category: ["external", "erc20"],
            withMetadata: true,
            excludeZeroValue: false,
            maxCount: "0x3e8",
            order: "desc",
            ...(pageKey ? { pageKey } : {}),
          },
        ] as never,
      })) as { transfers: RawTransfer[]; pageKey?: string };

      for (const t of res.transfers) {
        out.push({
          hash: t.hash.toLowerCase(),
          blockNum: Number.parseInt(t.blockNum, 16),
          category: t.category,
          timestamp: Math.floor(new Date(t.metadata.blockTimestamp).getTime() / 1000),
          ethValue: t.category === "external" && t.asset === "ETH" ? Number(t.value ?? 0) : 0,
        });
      }

      if (!res.pageKey) break;
      pageKey = res.pageKey;
    }
  }

  return out;
}

export async function getReceipt(hash: string) {
  try {
    return await httpClient.getTransactionReceipt({ hash: hash as Hex });
  } catch {
    return null;
  }
}
