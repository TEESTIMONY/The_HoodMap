import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addressFromTopic,
  isAddress,
  normalizeAddress,
  normalizeAddressOrNull,
} from "./address.js";

const CHECKSUMMED = "0x52908400098527886E0F7030069857D2E4169EE7";

test("normalizeAddress lower-cases a checksummed address", () => {
  assert.equal(normalizeAddress(CHECKSUMMED), CHECKSUMMED.toLowerCase());
});

test("normalizeAddress is idempotent", () => {
  const once = normalizeAddress(CHECKSUMMED);
  assert.equal(normalizeAddress(once), once);
});

test("normalizeAddress rejects non-addresses", () => {
  assert.throws(() => normalizeAddress("0x123"));
  assert.throws(() => normalizeAddress("not-an-address"));
  assert.throws(() => normalizeAddress(`0x${"g".repeat(40)}`));
});

test("normalizeAddressOrNull passes through null/undefined", () => {
  assert.equal(normalizeAddressOrNull(null), null);
  assert.equal(normalizeAddressOrNull(undefined), null);
  assert.equal(normalizeAddressOrNull(CHECKSUMMED), CHECKSUMMED.toLowerCase());
});

test("addressFromTopic extracts the 20-byte address from a left-padded topic", () => {
  const topic = "0x000000000000000000000000" + "52908400098527886e0f7030069857d2e4169ee7";
  assert.equal(addressFromTopic(topic), "0x52908400098527886e0f7030069857d2e4169ee7");
});

test("isAddress accepts valid, rejects invalid", () => {
  assert.equal(isAddress(CHECKSUMMED), true);
  assert.equal(isAddress("0xabc"), false);
});
