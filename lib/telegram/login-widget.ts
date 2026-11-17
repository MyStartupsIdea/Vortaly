import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Server-side verification of the Telegram Login Widget payload.
 *
 * The widget (telegram.org/js/telegram-widget.js) hands the page an object
 * `{ id, first_name, last_name?, username?, photo_url?, auth_date, hash }`.
 * It is NOT the Mini App `initData` and is signed differently:
 *
 *   data_check_string = every field except `hash`, as `key=value`, sorted by
 *                       key, joined with "\n"
 *   secret_key        = SHA256(<bot token>)          (Mini App: HMAC "WebAppData")
 *   valid             = hex(HMAC_SHA256(secret_key, data_check_string)) == hash
 *
 * The widget only works on the domain set for the bot with @BotFather
 * (/setdomain), so it cannot be exercised on localhost.
 */

/** A login is a moment, not a session: refuse payloads older than this. */
const MAX_AGE_SECONDS = 24 * 60 * 60;
const FUTURE_SKEW_SECONDS = 60;
const FIELDS = ["id", "first_name", "last_name", "username", "photo_url", "auth_date", "hash"];

export interface TelegramLogin {
  id: number;
  firstName?: string;
  username?: string;
}

export type LoginWidgetResult =
  | { ok: true; user: TelegramLogin }
  | { ok: false; reason: "not_configured" | "invalid" | "expired" };

export function verifyLoginWidget(raw: unknown, now: number = Date.now()): LoginWidgetResult {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return { ok: false, reason: "not_configured" };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "invalid" };

  const input = raw as Record<string, unknown>;
  const hash = typeof input.hash === "string" ? input.hash : "";
  if (!/^[0-9a-f]{64}$/i.test(hash)) return { ok: false, reason: "invalid" };

  // Only the widget's own fields take part: anything extra a client adds is
  // dropped rather than allowed to change what gets signed.
  const lines: string[] = [];
  for (const key of FIELDS) {
    if (key === "hash") continue;
    const value = input[key];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string" && typeof value !== "number") return { ok: false, reason: "invalid" };
    lines.push(`${key}=${value}`);
  }
  lines.sort();

  const secret = createHash("sha256").update(token).digest();
  const expected = createHmac("sha256", secret).update(lines.join("\n")).digest();
  const given = Buffer.from(hash, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "invalid" };
  }

  const authDate = Number(input.auth_date);
  if (!Number.isSafeInteger(authDate) || authDate <= 0) return { ok: false, reason: "invalid" };
  const age = Math.floor(now / 1000) - authDate;
  if (age > MAX_AGE_SECONDS || age < -FUTURE_SKEW_SECONDS) return { ok: false, reason: "expired" };

  const id = Number(input.id);
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, reason: "invalid" };

  const text = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, 64) : undefined;
  return { ok: true, user: { id, firstName: text(input.first_name), username: text(input.username) } };
}
