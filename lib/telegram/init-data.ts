import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Server-side verification of Telegram Mini App `initData`.
 *
 * The Mini App receives a signed query string from the Telegram client
 * (`window.Telegram.WebApp.initData`) and forwards it to this API. Verifying it
 * is the only way the server can know *which* Telegram user is calling:
 * `initDataUnsafe.user.id` is, as its name says, unsafe — it is a plain number
 * the browser can set to anything.
 *
 * Scheme (Telegram Bot API, "Validating data received via the Mini App"):
 *
 *   data_check_string = all received key=value pairs except `hash`, each on its
 *                       own line, sorted by key
 *   secret_key        = HMAC_SHA256(key: "WebAppData", data: <bot token>)
 *   expected          = hex(HMAC_SHA256(key: secret_key, data: data_check_string))
 *   valid             = expected == hash
 *
 * Only the bot token proves the signature, so this module must never run in the
 * browser and must never be imported from a client component. It requires the
 * Node runtime (`node:crypto`), so route handlers using it declare
 * `export const runtime = "nodejs"`.
 *
 * What verification does and does not give you:
 *  - it proves the payload was issued by Telegram for this bot, and names the
 *    user it was issued to;
 *  - it does not make the payload single-use. `initData` is a bearer
 *    credential: it is issued once when the Mini App opens and stays valid
 *    until `auth_date` ages out, so anyone who captures one can replay it
 *    within that window. That is inherent to the scheme; the TTL below is what
 *    bounds it.
 */

/**
 * How old `auth_date` may be. Telegram issues `initData` when the Mini App
 * opens and never refreshes it while the app stays open, so this cannot be
 * short without logging out people who leave the app in the background. One
 * day is the common default; lower it here if the pilot wants a tighter
 * window — it is a constant on purpose, so the bound cannot be loosened by an
 * environment variable.
 */
export const INIT_DATA_MAX_AGE_SECONDS = 86_400;

/** Clock skew allowed on an `auth_date` that sits in the future. */
const FUTURE_SKEW_SECONDS = 60;

/** Generous ceiling; a real payload is a few hundred bytes. */
const MAX_INIT_DATA_LENGTH = 4096;

export type InitDataFailure =
  /** No `TELEGRAM_BOT_TOKEN` on the server: nothing can be verified at all. */
  | "not_configured"
  /** The request carried no `initData`. */
  | "missing"
  /** Present but not a signed Telegram payload, or the signature is wrong. */
  | "invalid"
  /** Correctly signed, but `auth_date` is outside the accepted window. */
  | "expired"
  /** Correctly signed, but carries no `user` (e.g. an inline-query context). */
  | "no_user";

export interface VerifiedTelegramUser {
  id: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
}

export type InitDataVerification =
  | { ok: true; user: VerifiedTelegramUser; authDate: Date }
  | { ok: false; reason: InitDataFailure };

function botToken(): string | undefined {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return token ? token : undefined;
}

/**
 * True when the server holds a bot token and can therefore verify callers.
 *
 * Endpoints use this to decide their posture rather than guessing: identity is
 * mandatory wherever it can be checked, and an endpoint that cannot do without
 * it (reading someone's bookings) refuses to serve when it cannot check.
 */
export function isTelegramVerificationConfigured(): boolean {
  return botToken() !== undefined;
}

/**
 * Pulls the raw `initData` off a request.
 *
 * Two accepted channels:
 *  - `X-Telegram-Init-Data: <initData>`
 *  - `Authorization: tma <initData>` (the convention in Telegram's own docs)
 *
 * A header, not a body field or a query parameter: it works for GET, it is not
 * captured in access logs the way a query string is, and it leaves the request
 * body free of credentials. The `tma` scheme does not collide with the
 * `Bearer` scheme that the salon-owner endpoints use for Supabase sessions.
 */
export function readInitData(request: Request): string | undefined {
  const header = request.headers.get("x-telegram-init-data")?.trim();
  if (header) return header;

  const authorization = request.headers.get("authorization")?.trim();
  if (authorization) {
    const match = /^tma\s+(.+)$/i.exec(authorization);
    const candidate = match?.[1].trim();
    if (candidate) return candidate;
  }

  return undefined;
}

/** Sorted `key=value` lines, optionally keeping the Ed25519 `signature` field. */
function dataCheckString(
  pairs: { key: string; value: string }[],
  includeSignature: boolean,
): string {
  return pairs
    .filter((pair) => includeSignature || pair.key !== "signature")
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((pair) => `${pair.key}=${pair.value}`)
    .join("\n");
}

function hmacHex(key: Buffer | string, data: string): string {
  return createHmac("sha256", key).update(data).digest("hex");
}

/** Constant-time comparison of two lowercase hex digests of equal length. */
function hexEquals(a: string, b: string): boolean {
  const left = Buffer.from(a.toLowerCase(), "hex");
  const right = Buffer.from(b.toLowerCase(), "hex");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

/**
 * Verifies a raw `initData` string.
 *
 * @param now milliseconds since the epoch; injectable so the age check can be
 *   exercised without waiting a day.
 */
export function verifyInitData(
  initData: string | undefined,
  now: number = Date.now(),
): InitDataVerification {
  const token = botToken();
  if (!token) return { ok: false, reason: "not_configured" };

  if (!initData) return { ok: false, reason: "missing" };
  if (initData.length > MAX_INIT_DATA_LENGTH) return { ok: false, reason: "invalid" };

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const hash = params.get("hash");
  // A SHA-256 digest in hex: 64 characters. Checking the shape first keeps
  // `hexEquals` from ever being handed something it cannot decode.
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return { ok: false, reason: "invalid" };

  const pairs: { key: string; value: string }[] = [];
  let hasSignature = false;
  params.forEach((value, key) => {
    if (key === "hash") return;
    if (key === "signature") hasSignature = true;
    pairs.push({ key, value });
  });
  if (pairs.length === 0) return { ok: false, reason: "invalid" };

  const secret = createHmac("sha256", "WebAppData").update(token).digest();

  // `signature` (Bot API 8.0) is the Ed25519 field used for third-party
  // validation and is not part of the HMAC check string. Both variants are
  // tried when it is present, so this keeps verifying correctly whichever way
  // Telegram counts that field. Trying both costs one extra HMAC and weakens
  // nothing: either string still has to be signed with this bot's secret.
  let signatureMatches = hexEquals(hmacHex(secret, dataCheckString(pairs, false)), hash);
  if (!signatureMatches && hasSignature) {
    signatureMatches = hexEquals(hmacHex(secret, dataCheckString(pairs, true)), hash);
  }
  if (!signatureMatches) return { ok: false, reason: "invalid" };

  // Everything below is trusted only because the signature checked out.
  const authDateRaw = params.get("auth_date");
  const authDateSeconds = authDateRaw ? Number(authDateRaw) : Number.NaN;
  if (!Number.isSafeInteger(authDateSeconds) || authDateSeconds <= 0) {
    return { ok: false, reason: "invalid" };
  }

  const ageSeconds = Math.floor(now / 1000) - authDateSeconds;
  if (ageSeconds > INIT_DATA_MAX_AGE_SECONDS) return { ok: false, reason: "expired" };
  if (ageSeconds < -FUTURE_SKEW_SECONDS) return { ok: false, reason: "expired" };

  const userRaw = params.get("user");
  if (!userRaw) return { ok: false, reason: "no_user" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(userRaw);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "invalid" };
  }

  const candidate = parsed as Record<string, unknown>;
  const id = candidate.id;
  // `telegram_user_id` is a Postgres `bigint`; only a safe integer fits.
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
    return { ok: false, reason: "invalid" };
  }

  const text = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() ? value.trim() : undefined;

  return {
    ok: true,
    authDate: new Date(authDateSeconds * 1000),
    user: {
      id,
      firstName: text(candidate.first_name),
      lastName: text(candidate.last_name),
      username: text(candidate.username),
      languageCode: text(candidate.language_code),
    },
  };
}

/* ------------------------------------------------------ request policies --- */

export type RequiredIdentity =
  | { ok: true; userId: number; user: VerifiedTelegramUser }
  | { ok: false; reason: InitDataFailure };

/**
 * For endpoints that cannot run without knowing who is calling — reading or
 * changing a customer's own records.
 *
 * A missing bot token fails with `not_configured` (503) rather than letting the
 * request through: an endpoint scoped to "this customer" has no safe meaning
 * when the server cannot tell which customer it is.
 */
export function requireTelegramUser(request: Request): RequiredIdentity {
  const result = verifyInitData(readInitData(request));
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, userId: result.user.id, user: result.user };
}

export type OptionalIdentity =
  /** Verified caller. */
  | { ok: true; userId: number; user: VerifiedTelegramUser; verified: true }
  /** Verification is switched off server-side; the caller stays anonymous. */
  | { ok: true; userId: null; verified: false }
  | { ok: false; reason: InitDataFailure };

/**
 * For endpoints that can serve an anonymous caller but must never accept a
 * *claimed* identity — creating a booking.
 *
 * With a bot token configured, identity is mandatory and must verify. Without
 * one, the request proceeds with no identity attached at all: the booking is
 * stored without a `telegram_user_id` instead of with an unverified one. In no
 * configuration is a client-supplied user id trusted.
 */
export function optionalTelegramUser(request: Request): OptionalIdentity {
  if (!isTelegramVerificationConfigured()) {
    console.warn(
      "[telegram.initData] TELEGRAM_BOT_TOKEN is not set — bookings are accepted " +
        "without a verified Telegram identity. Set the token before going live.",
    );
    return { ok: true, userId: null, verified: false };
  }

  const result = verifyInitData(readInitData(request));
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, userId: result.user.id, user: result.user, verified: true };
}
