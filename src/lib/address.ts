/**
 * All addresses are stored lower-cased everywhere in the system so that
 * joins between the raw layer (indexer writes) and the API/analytics layer
 * (reads) never miss on checksum casing. viem returns EIP-55 checksummed
 * addresses; every value that reaches Postgres must go through here first.
 */

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function normalizeAddress(value: string): `0x${string}` {
  if (!ADDRESS_RE.test(value)) {
    throw new Error(`not an address: ${value}`);
  }
  return value.toLowerCase() as `0x${string}`;
}

/** Null-safe variant for optional columns (e.g. contract-creation `to`). */
export function normalizeAddressOrNull(value: string | null | undefined): `0x${string}` | null {
  if (value == null) return null;
  return normalizeAddress(value);
}

/** A 32-byte topic that encodes a left-padded address -> the 20-byte address. */
export function addressFromTopic(topic: string): `0x${string}` {
  return normalizeAddress(`0x${topic.slice(-40)}`);
}

export function isAddress(value: string): boolean {
  return ADDRESS_RE.test(value);
}
