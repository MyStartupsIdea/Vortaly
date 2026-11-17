import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Authorization for the platform-admin surface (`/api/admin/*`).
 *
 * There is one credential — `PLATFORM_ADMIN_SECRET` — and it stays on the
 * server. It is presented in one of two ways:
 *
 *  1. **Header**, for server-to-server and operator tooling (curl, scripts):
 *     `Authorization: Bearer <secret>` or `x-platform-admin-secret: <secret>`.
 *     Unchanged from before; nothing that worked stops working.
 *
 *  2. **Session cookie**, for the browser console at `/`. The operator posts
 *     the secret once to `POST /api/admin/session`; the server verifies it and
 *     hands back an httpOnly cookie. The browser therefore never holds the
 *     secret itself — only a short-lived token derived from it, which JavaScript
 *     on the page cannot read.
 *
 * Why not simply hand the secret to the client: any value the browser needs
 * (a `NEXT_PUBLIC_*` env var, a value inlined into the bundle, a readable
 * cookie) is public. The console is a browser app, so the only way it can call
 * a secret-guarded endpoint without publishing the secret is for the server to
 * exchange the secret for a session.
 *
 * Properties of the session token:
 *  - `v1.<expiry>.<nonce>.<hmac>`, where the HMAC is keyed by the secret, so
 *    the cookie does not contain the secret and cannot be used to recover it.
 *  - It expires (see `ADMIN_SESSION_TTL_SECONDS`), and the expiry is signed, so
 *    a client cannot extend its own session.
 *  - Rotating `PLATFORM_ADMIN_SECRET` invalidates every outstanding session,
 *    because the key that signed them is gone.
 *
 * Default-closed is preserved end to end: with no secret configured, every
 * check below returns false and `/api/admin/*` is unreachable — in development
 * exactly as in production. There is no local bypass.
 *
 * Client-facing state contract:
 *  - The session endpoint returns the machine-readable shape understood by
 *    `lib/api/salons.ts` / `useAdminData(...)`: it distinguishes "this browser
 *    has a valid session" from "this deployment has no admin secret", so the
 *    console can render "admin authorization required" and never silently
 *    present demo data as real data.
 */

/** Name chosen to collide with nothing else the platform sets. */
export const ADMIN_SESSION_COOKIE = "vortaly.admin";

/** How long one unlock lasts. Short enough that a stale laptop is not a key. */
export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;

const TOKEN_VERSION = "v1";

/**
 * The configured secret, or null when there is none.
 *
 * Read per call rather than captured at module load: a route module is
 * evaluated once per server instance, and reading it lazily means a value
 * supplied later (or rotated) is picked up without a stale copy surviving in
 * this module.
 */
function configuredSecret(): string | null {
  const secret = process.env.PLATFORM_ADMIN_SECRET?.trim();
  return secret ? secret : null;
}

/**
 * Whether platform-admin auth can work at all. The console uses this to tell
 * "you need to unlock" apart from "this deployment has no admin secret", which
 * are two different problems with two different fixes.
 */
export function adminAuthConfigured(): boolean {
  return configuredSecret() !== null;
}

/**
 * Compares two strings without leaking their contents — or their lengths —
 * through timing. Both sides are hashed first so `timingSafeEqual` always gets
 * two buffers of the same size.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a, "utf8").digest();
  const right = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(left, right);
}

/** True when `candidate` is exactly the configured secret. */
export function adminSecretMatches(candidate: unknown): boolean {
  const secret = configuredSecret();
  if (!secret) return false;
  if (typeof candidate !== "string" || candidate.length === 0) return false;
  return constantTimeEqual(candidate, secret);
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

/**
 * Mints a session token, or returns null when no secret is configured (in
 * which case there is nothing to issue a session against).
 */
export function issueAdminSession(now: number = Date.now()): string | null {
  const secret = configuredSecret();
  if (!secret) return null;

  const expiry = Math.floor(now / 1000) + ADMIN_SESSION_TTL_SECONDS;
  // The nonce makes two sessions minted in the same second distinct, so one
  // token is never a copy of another.
  const nonce = randomBytes(12).toString("base64url");
  const payload = `${TOKEN_VERSION}.${expiry}.${nonce}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** True when `token` is a session this server signed and which has not expired. */
export function adminSessionValid(token: string | undefined, now: number = Date.now()): boolean {
  const secret = configuredSecret();
  if (!secret || !token) return false;

  const parts = token.split(".");
  if (parts.length !== 4) return false;

  const [version, expiryRaw, nonce, signature] = parts;
  if (version !== TOKEN_VERSION || !nonce || !signature) return false;

  const expiry = Number.parseInt(expiryRaw, 10);
  if (!Number.isSafeInteger(expiry)) return false;
  // Expiry is checked before the signature so an expired token is rejected
  // even if it was signed correctly.
  if (expiry * 1000 <= now) return false;

  const expected = sign(`${version}.${expiryRaw}.${nonce}`, secret);
  return constantTimeEqual(signature, expected);
}

/**
 * Reads one cookie by exact name.
 *
 * Split on `;` and match the name exactly, for the same reason
 * `lib/domain/owner-auth.ts` does: a single regular expression can match the
 * wrong cookie when another one happens to come first in the header.
 */
export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;

    const raw = part.slice(separator + 1).trim();
    if (!raw) return undefined;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }

  return undefined;
}

/** Returns true when the platform has any admin secret configured. */
export function adminConfigured(_request: Request = new Request("")): boolean {
  return configuredSecret() !== null;
}

/** True when the request carries the secret in a header. */
function headerAuthorized(request: Request, secret: string): boolean {
  const auth = (request.headers.get("authorization") ?? "").trim();
  if (auth.startsWith("Bearer ")) {
    const presented = auth.slice(7);
    if (presented && constantTimeEqual(presented, secret)) return true;
  }

  const legacy = request.headers.get("x-platform-admin-secret");
  return legacy ? constantTimeEqual(legacy, secret) : false;
}

/**
 * The single authorization gate for `/api/admin/*`.
 *
 * Returns false when no secret is configured (default-closed), and otherwise
 * accepts either header credential or a valid session cookie. It never logs
 * the secret, and callers must not tell the client which way the check failed.
 */
export function adminAuthorized(request: Request): boolean {
  const secret = configuredSecret();
  if (!secret) return false;

  if (headerAuthorized(request, secret)) return true;
  return adminSessionValid(readCookie(request, ADMIN_SESSION_COOKIE));
}
