import { config } from "../config/index.js";
import { logger } from "../config/logger.js";
import { createTelegram, TelegramApiError, type TgMessage, type TgUpdate } from "./telegram.js";
import { BusyError, createCoalescer, createLimiter } from "./limiter.js";
import {
  extractAddress,
  formatToken,
  formatTrending,
  formatWallet,
  helpText,
  isBareAddress,
  parseCommand,
  parseSort,
  type TokenDetail,
  type TokenReport,
  type TokenRow,
  type WalletSummary,
} from "./format.js";

/**
 * HoodMap Telegram bot — lookups only. It's a thin client of the same API the
 * website uses (localhost by default), so scores and P&L match the site exactly
 * and the bot needs no database access of its own.
 *
 * Concurrency model (the bot shares a 1GB VM with the indexer/API/stats worker):
 *   - updates are handled concurrently, but every API call goes through one
 *     limiter (a few at a time, bounded queue, shed with "busy" beyond that);
 *   - identical in-flight requests are coalesced and results briefly cached, so
 *     a token everyone is scanning costs one API call, not one per user;
 *   - one request in flight per user, with feedback instead of silent drops;
 *   - outgoing messages are paced under Telegram's limits and retried on 429;
 *   - on SIGTERM, in-flight requests finish and reply before the process exits.
 */

// Exit code for "fix your config" failures. The systemd unit lists it under
// RestartPreventExitStatus so a missing/rejected token stops the service
// instead of crash-looping it every few seconds.
const EXIT_CONFIG = 2;

const token = config.TELEGRAM_BOT_TOKEN;
if (!token) {
  logger.error("TELEGRAM_BOT_TOKEN is not set — create a bot with @BotFather and add it to .env");
  process.exit(EXIT_CONFIG);
}

const tg = createTelegram(token);
const API = config.BOT_API_URL ?? `http://127.0.0.1:${config.API_PORT}`;
const SITE = config.BOT_SITE_URL.replace(/\/$/, "");

// wallet P&L is computed on demand for a wallet's first lookup and can run long
const API_TIMEOUT_MS = 30_000;

// ---- tunables ----

/** API calls in flight at once. Wallet P&L is the expensive one; keep this small. */
const API_CONCURRENCY = 4;
/** API calls allowed to wait for a slot, and for how long, before we shed with "busy". */
const API_MAX_QUEUE = 60;
const API_MAX_WAIT_MS = 15_000;
/** Cache lifetimes. The data is minutes-fresh at best, so short TTLs cost nothing. */
const TTL_TOKEN_MS = 20_000;
const TTL_WALLET_MS = 60_000;
const TTL_LIST_MS = 30_000;
/** Minimum spacing between one user's requests (spam guard for cheap commands). */
const MIN_GAP_MS = 1_500;
/** Stay under Telegram's ~30 messages/second/bot; 40ms spacing = 25/s. */
const SEND_SPACING_MS = 40;
const SEND_MAX_RETRIES = 3;
/** How long shutdown waits for in-flight requests to finish and reply. */
const DRAIN_MS = 8_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---- API client (limited + coalesced) ----

interface ApiResult<T> {
  status: number;
  body: T | null;
}

const apiLimiter = createLimiter({
  concurrency: API_CONCURRENCY,
  maxQueue: API_MAX_QUEUE,
  maxWaitMs: API_MAX_WAIT_MS,
});
const apiCache = createCoalescer();

async function rawGet<T>(path: string): Promise<ApiResult<T>> {
  const res = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
  const body = (await res.json().catch(() => null)) as T | null;
  return { status: res.status, body };
}

/**
 * GET through the limiter, coalesced by path. A 404 is cached briefly on
 * purpose (a wallet pasted as a "token" would otherwise cost the API an RPC
 * discovery attempt on every retry); 5xx and timeouts are never cached.
 */
function apiGet<T>(path: string, ttlMs: number): Promise<ApiResult<T>> {
  return apiCache.get(path, ttlMs, () => apiLimiter.run(() => rawGet<T>(path)), (r) => r.status < 500);
}

/** A failure the user should hear about in plain words (vs. one we just log). */
class UserFacingError extends Error {}

function friendlyApiError(status: number): UserFacingError {
  if (status === 400) return new UserFacingError("That doesn't look like a valid address.");
  if (status === 503) return new UserFacingError("HoodMap's data is briefly unavailable. Try again in a minute.");
  return new UserFacingError("Something went wrong on our side. Try again in a minute.");
}

// ---- lookups ----

/** Returns null when the address isn't an ERC-20 the API can resolve. */
async function scanToken(address: string): Promise<string | null> {
  const [tok, rep] = await Promise.all([
    apiGet<TokenDetail>(`/api/v1/tokens/${address}`, TTL_TOKEN_MS),
    // the report is a bonus: if it fails for any reason the token still gets its market stats
    apiGet<TokenReport>(`/api/v1/tokens/${address}/report`, TTL_TOKEN_MS).catch(() => null),
  ]);
  if (tok.status === 404) return null;
  if (tok.status !== 200 || !tok.body) throw friendlyApiError(tok.status);
  return formatToken(tok.body, rep?.status === 200 ? rep.body : null, SITE);
}

async function lookupWallet(address: string): Promise<string> {
  const res = await apiGet<WalletSummary>(`/api/v1/wallets/${address}`, TTL_WALLET_MS);
  if (res.status !== 200 || !res.body) throw friendlyApiError(res.status);
  return formatWallet(address, res.body, SITE);
}

async function trending(arg: string): Promise<string> {
  const sort = parseSort(arg);
  const res = await apiGet<{ tokens: TokenRow[] }>(`/api/v1/tokens?sort=${sort}&limit=10`, TTL_LIST_MS);
  if (res.status !== 200 || !res.body) throw friendlyApiError(res.status);
  return formatTrending(res.body.tokens, sort, SITE);
}

// ---- sending (paced, retried) ----

let nextSendAt = 0;

/** Serialises send *starts* to one per SEND_SPACING_MS across all concurrent handlers. */
async function sendSlot(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSendAt);
  nextSendAt = at + SEND_SPACING_MS;
  if (at > now) await sleep(at - now);
}

async function reply(msg: TgMessage, text: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    await sendSlot();
    try {
      await tg.sendMessage(msg.chat.id, text, msg.message_id);
      return;
    } catch (err) {
      if (err instanceof TelegramApiError) {
        // 403: the user blocked the bot / kicked it from the group. Nothing to do.
        if (err.code === 403) return;
        // 429: over Telegram's rate limit. Honour its retry_after, a few times.
        if (err.code === 429 && attempt < SEND_MAX_RETRIES) {
          await sleep((err.retryAfterSec ?? 1) * 1000 + Math.random() * 250);
          continue;
        }
      }
      throw err;
    }
  }
}

// ---- update handling ----

/** One request in flight per user, and a short gap between requests. */
const inFlight = new Set<number>();
const lastAt = new Map<number, number>();
const lastBusyNoticeAt = new Map<number, number>();
let activeHandlers = 0;
let stopping = false;

setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;
  for (const m of [lastAt, lastBusyNoticeAt]) for (const [id, at] of m) if (at < cutoff) m.delete(id);
}, 10 * 60_000).unref();

let botUsername: string | undefined;

// "busy" can fire for every request in a burst; log it, but not once per user
let lastBusyLogAt = 0;
function logBusy(reason: string): void {
  const now = Date.now();
  if (now - lastBusyLogAt < 10_000) return;
  lastBusyLogAt = now;
  logger.warn({ reason, ...apiLimiter.stats(), ...apiCache.stats() }, "shedding load: bot is busy");
}

async function handleMessage(msg: TgMessage): Promise<void> {
  const text = msg.text?.trim();
  if (!text || msg.from?.is_bot) return;

  const isPrivate = msg.chat.type === "private";
  const cmd = parseCommand(text, botUsername);

  // In groups the bot only answers commands, never chatter or bare addresses.
  if (!cmd && !(isPrivate && isBareAddress(text))) {
    if (isPrivate) await reply(msg, "Send /help for commands, or paste a 0x… address.");
    return;
  }

  const userId = msg.from?.id ?? msg.chat.id;
  const now = Date.now();

  if (inFlight.has(userId)) {
    // Tell them once (not once per message, or we'd amplify a spammer into replies).
    if (now - (lastBusyNoticeAt.get(userId) ?? 0) > 5_000) {
      lastBusyNoticeAt.set(userId, now);
      await reply(msg, "Still working on your last request — one at a time, please.");
    }
    return;
  }
  if (now - (lastAt.get(userId) ?? 0) < MIN_GAP_MS) return;
  inFlight.add(userId);
  lastAt.set(userId, now);

  try {
    if (cmd?.cmd === "start" || cmd?.cmd === "help") {
      await reply(msg, helpText());
      return;
    }

    void tg.sendTyping(msg.chat.id).catch(() => {});

    if (cmd?.cmd === "trending") {
      await reply(msg, await trending(cmd.args));
      return;
    }

    if (cmd && cmd.cmd !== "scan" && cmd.cmd !== "wallet") {
      if (isPrivate) await reply(msg, "I don't know that command. Try /help.");
      return;
    }

    // /scan and /wallet need an address; a pasted bare address is auto-detected.
    const address = extractAddress(cmd ? cmd.args : text);
    if (!address) {
      await reply(msg, `Send it with an address, e.g. <code>/${cmd?.cmd ?? "scan"} 0x…</code>`);
      return;
    }

    if (cmd?.cmd === "wallet") {
      await reply(msg, await lookupWallet(address));
    } else if (cmd?.cmd === "scan") {
      const out = await scanToken(address);
      await reply(
        msg,
        out ?? "That address isn't an ERC-20 on Robinhood Chain. If it's a wallet, try /wallet."
      );
    } else {
      // bare address: a token if it resolves as one, otherwise treat it as a wallet
      await reply(msg, (await scanToken(address)) ?? (await lookupWallet(address)));
    }
  } catch (err) {
    if (err instanceof BusyError) {
      logBusy(err.message);
      await reply(msg, "HoodMap is getting a lot of requests right now. Try again in a few seconds.").catch(() => {});
    } else if (err instanceof UserFacingError) {
      await reply(msg, err.message).catch(() => {});
    } else if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      // the API keeps computing after we give up, so a retry usually lands on the cached result
      await reply(msg, "That's taking longer than usual. Try again in a minute.").catch(() => {});
    } else {
      logger.error({ err: errMsg(err) }, "command failed");
      await reply(msg, "Something went wrong on our side. Try again in a minute.").catch(() => {});
    }
  } finally {
    inFlight.delete(userId);
  }
}

async function handleUpdate(update: TgUpdate): Promise<void> {
  if (!update.message) return;
  activeHandlers++;
  try {
    await handleMessage(update.message);
  } finally {
    activeHandlers--;
  }
}

// ---- main loop ----

async function main(): Promise<void> {
  for (let attempt = 1; !botUsername; attempt++) {
    try {
      botUsername = (await tg.getMe()).username;
    } catch (err) {
      if (err instanceof TelegramApiError && err.code === 401) {
        logger.error("Telegram rejected the bot token (401) — check TELEGRAM_BOT_TOKEN");
        process.exit(EXIT_CONFIG);
      }
      const wait = Math.min(30_000, 1_000 * 2 ** (attempt - 1));
      logger.warn({ attempt, err: errMsg(err) }, "getMe failed, retrying");
      await sleep(wait);
    }
  }
  logger.info(
    { bot: `@${botUsername}`, api: API, apiConcurrency: API_CONCURRENCY, maxQueue: API_MAX_QUEUE },
    "telegram bot started"
  );

  let offset = 0;
  let failures = 0;
  while (!stopping) {
    try {
      const updates = await tg.getUpdates(offset, 30);
      failures = 0;
      for (const u of updates) {
        // Advance before handling: a lookup bot is at-most-once by design (a crash
        // mid-request drops that one lookup rather than replaying and double-replying).
        offset = u.update_id + 1;
        void handleUpdate(u).catch((err) => logger.error({ err: errMsg(err) }, "update handling failed"));
      }
    } catch (err) {
      if (stopping) break;
      if (err instanceof TelegramApiError) {
        if (err.code === 401) {
          logger.error("Telegram rejected the bot token (401) — check TELEGRAM_BOT_TOKEN");
          process.exit(EXIT_CONFIG);
        }
        // 409 = another process is polling this same token (e.g. a local dev copy)
        if (err.code === 409) logger.error("another instance is polling this bot token (409)");
        if (err.retryAfterSec) {
          await sleep(err.retryAfterSec * 1000);
          continue;
        }
      }
      failures++;
      const wait = Math.min(30_000, 1_000 * 2 ** (failures - 1)) * (0.75 + Math.random() * 0.5);
      logger.warn({ failures, wait: Math.round(wait), err: errMsg(err) }, "poll failed");
      await sleep(wait);
    }
  }
}

/**
 * Stop taking new work, let in-flight lookups finish and reply (bounded by
 * DRAIN_MS), then exit. The abandoned long poll is harmless: Telegram keeps any
 * update we hadn't acknowledged and delivers it to the next process.
 */
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info({ signal, inFlight: activeHandlers }, "stopping: draining in-flight requests");
  const deadline = Date.now() + DRAIN_MS;
  while (activeHandlers > 0 && Date.now() < deadline) await sleep(50);
  if (activeHandlers > 0) logger.warn({ abandoned: activeHandlers }, "drain timed out");
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

main().catch((err) => {
  logger.error({ err }, "bot crashed");
  process.exit(1);
});
