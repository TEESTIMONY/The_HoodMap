import { test } from "node:test";
import assert from "node:assert/strict";
import {
  escapeHtml,
  extractAddress,
  formatToken,
  formatTrending,
  formatWallet,
  isBareAddress,
  parseCommand,
  parseSort,
  priceUsd,
  signedUsd,
  since,
  usdCompact,
  walletTier,
  type TokenDetail,
  type WalletSummary,
} from "./format.js";

const ADDR = "0x2620d1fd6859fb0219580ce29bfa9592550535e2";
const SITE = "https://example.test";

function token(over: Partial<TokenDetail> = {}): TokenDetail {
  return {
    address: ADDR,
    symbol: "PEPE",
    name: "Pepe",
    token_type: "meme_token",
    price: "0.000004877",
    market_cap: "4877.32",
    fdv: "4877.32",
    liquidity_usd: "6458.18",
    volume_24h: "1200.5",
    buy_count_24h: 12,
    sell_count_24h: 5,
    price_confidence: "medium",
    last_trade_at: "2026-09-18T10:00:00.000Z",
    first_seen: "2026-09-16T10:00:00.000Z",
    ...over,
  };
}

test("escapeHtml neutralises markup in on-chain strings", () => {
  assert.equal(escapeHtml(`<a href="x">&`), "&lt;a href=\"x\"&gt;&amp;");
});

test("formatToken never lets a hostile token name inject HTML", () => {
  const out = formatToken(token({ symbol: "<b>x</b>", name: "<script>alert(1)</script>" }), null, SITE);
  assert.ok(!out.includes("<script>"));
  assert.ok(!out.includes("<B>X</B>"));
  assert.ok(out.includes("&lt;B&gt;X&lt;/B&gt;"));
});

test("formatToken with no price says so instead of printing dashes", () => {
  const out = formatToken(token({ price: null }), null, SITE);
  assert.ok(out.includes("No price yet"));
  assert.ok(!out.includes("Mkt cap"));
});

test("formatToken includes HoodScore reasons and links out", () => {
  const out = formatToken(
    token(),
    {
      holders: { count: 42, top1_pct: 12.34, top10_pct: 55.5 },
      hoodscore: { grade: "C", score: 61, reasons: ["Largest wallet holds 12.3%", "Thin liquidity (~$6,458)"] },
    },
    SITE,
    Date.parse("2026-09-19T10:00:00.000Z")
  );
  assert.ok(out.includes("HoodScore C"));
  assert.ok(out.includes("• Thin liquidity"));
  assert.ok(out.includes("top wallet 12.3%"));
  assert.ok(out.includes(`${SITE}/scan/${ADDR}`));
  assert.ok(out.includes(`${SITE}/map/${ADDR}`));
  assert.ok(out.includes("Age  3d"));
});

test("formatWallet handles a wallet with no indexed trades", () => {
  const w = { has_trades: false } as WalletSummary;
  const out = formatWallet(ADDR, w, SITE);
  assert.ok(out.includes("No DEX trades indexed"));
});

test("formatWallet shows signed P&L and rounded percentages", () => {
  const w: WalletSummary = {
    has_trades: true,
    total_pnl: "11400",
    realized_pnl: "9700",
    unrealized_pnl: "-260.4",
    total_volume: "19500",
    win_rate: "0.881",
    roi: "1.684",
    total_trades: 465,
    tokens_traded: 104,
    open_positions: 35,
    closed_positions: 69,
    pnl_confidence: "low",
  };
  const out = formatWallet(ADDR, w, SITE);
  assert.ok(out.includes("+$11.4K"));
  assert.ok(out.includes("Unrealized  -$260.40"));
  assert.ok(out.includes("Win rate  88%"));
  assert.ok(out.includes("ROI  +168%"));
  assert.ok(out.includes("UP BIG"));
  assert.ok(out.includes("Confidence  LOW"));
});

test("walletTier grades by sign, size and win rate", () => {
  const base = { has_trades: true, total_trades: 10 } as WalletSummary;
  assert.equal(walletTier({ ...base, total_pnl: "20", roi: "0.1" }), "PROFITABLE");
  assert.equal(walletTier({ ...base, total_pnl: "6000", roi: "0.1" }), "UP BIG");
  assert.equal(walletTier({ ...base, total_pnl: "-10", win_rate: "0.5" }), "MIXED BAG");
  assert.equal(walletTier({ ...base, total_pnl: "-10", win_rate: "0.2" }), "DOWN BAD");
  assert.equal(walletTier({ has_trades: false } as WalletSummary), "NEW WALLET");
});

test("formatTrending numbers rows and links each ticker to its scan", () => {
  const out = formatTrending(
    [
      { address: ADDR, symbol: "pepe", price: "0.5", volume_24h: "9000", liquidity_usd: "4000", fdv: null, first_seen: null, last_trade_at: null },
    ],
    "volume",
    SITE
  );
  assert.ok(out.includes("1. "));
  assert.ok(out.includes(`href="${SITE}/scan/${ADDR}"`));
  assert.ok(out.includes("PEPE"));
  assert.ok(out.includes("vol $9.0K"));
});

test("formatTrending on an empty list says so", () => {
  assert.equal(formatTrending([], "volume", SITE), "No tokens to show yet.");
});

test("parseCommand splits command and args, and honours @bot suffixes", () => {
  assert.deepEqual(parseCommand("/scan 0xabc"), { cmd: "scan", args: "0xabc" });
  assert.deepEqual(parseCommand("/help"), { cmd: "help", args: "" });
  assert.deepEqual(parseCommand("/Scan@HoodMapBot  0xabc ", "hoodmapbot"), { cmd: "scan", args: "0xabc" });
  assert.equal(parseCommand("/scan@OtherBot 0xabc", "HoodMapBot"), null);
  assert.equal(parseCommand("scan 0xabc"), null);
});

test("extractAddress finds an address inside text and lower-cases it", () => {
  assert.equal(extractAddress(`look at ${ADDR.toUpperCase().replace("0X", "0x")} pls`), ADDR);
  assert.equal(extractAddress("no address here"), null);
  // 41 hex chars is not an address
  assert.equal(extractAddress(`${ADDR}a`), null);
});

test("isBareAddress only matches a message that is just an address", () => {
  assert.equal(isBareAddress(`  ${ADDR} `), true);
  assert.equal(isBareAddress(`scan ${ADDR}`), false);
});

test("parseSort accepts aliases and defaults to volume", () => {
  assert.equal(parseSort("NEW"), "new");
  assert.equal(parseSort("liq"), "liquidity");
  assert.equal(parseSort(""), "volume");
  assert.equal(parseSort("nonsense"), "volume");
});

test("usdCompact / signedUsd / priceUsd format like the website", () => {
  assert.equal(usdCompact("1234567"), "$1.23M");
  assert.equal(usdCompact(null), "—");
  assert.equal(usdCompact(-26.1), "-$26.10");
  assert.equal(signedUsd(1700), "+$1.7K");
  assert.equal(signedUsd(-1700), "-$1.7K");
  assert.equal(priceUsd("12.5"), "$12.5");
  assert.equal(priceUsd("0.0000051"), "$0.0₅51");
});

test("since gives a coarse age", () => {
  const now = Date.parse("2026-09-19T00:00:00.000Z");
  assert.equal(since("2026-09-18T22:00:00.000Z", now), "2h");
  assert.equal(since("2026-09-15T00:00:00.000Z", now), "4d");
  assert.equal(since(null, now), "—");
});
