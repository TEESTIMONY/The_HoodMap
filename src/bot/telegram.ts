/**
 * Minimal Telegram Bot API client — just the four methods the bot needs, over
 * plain fetch (Node 20+), so the bot adds no dependency and stays small on a
 * 1GB VM. The token lives only in the request URL; nothing here logs a URL or
 * a request body, so it can't leak into journald.
 */

export interface TgUser {
  id: number;
  is_bot?: boolean;
}

export interface TgMessage {
  message_id: number;
  chat: { id: number; type: "private" | "group" | "supergroup" | "channel" };
  from?: TgUser;
  text?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}

export class TelegramApiError extends Error {
  constructor(
    readonly method: string,
    readonly code: number,
    message: string,
    readonly retryAfterSec?: number
  ) {
    super(`telegram ${method} failed (${code}): ${message}`);
  }
}

interface TgResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

export function createTelegram(token: string) {
  const base = `https://api.telegram.org/bot${token}`;

  async function call<T>(method: string, body: Record<string, unknown>, timeoutMs = 15_000): Promise<T> {
    const res = await fetch(`${base}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = (await res.json().catch(() => null)) as TgResponse<T> | null;
    if (!json || !json.ok) {
      throw new TelegramApiError(
        method,
        json?.error_code ?? res.status,
        json?.description ?? res.statusText,
        json?.parameters?.retry_after
      );
    }
    return json.result as T;
  }

  return {
    getMe: () => call<{ username: string }>("getMe", {}),

    /** Long poll: Telegram holds the request open up to `timeoutSec` for new updates. */
    getUpdates: (offset: number, timeoutSec: number) =>
      call<TgUpdate[]>("getUpdates", { offset, timeout: timeoutSec, allowed_updates: ["message"] }, (timeoutSec + 15) * 1000),

    sendMessage: (chatId: number, text: string, replyToMessageId?: number) =>
      call("sendMessage", {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        ...(replyToMessageId
          ? { reply_parameters: { message_id: replyToMessageId, allow_sending_without_reply: true } }
          : {}),
      }),

    sendTyping: (chatId: number) => call("sendChatAction", { chat_id: chatId, action: "typing" }, 5_000),
  };
}

export type Telegram = ReturnType<typeof createTelegram>;
