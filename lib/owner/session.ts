import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readCookie } from "@/lib/domain/admin-auth";

/**
 * The business owner's session: who they are on Telegram, nothing more.
 *
 * Which businesses they may open is NOT in the cookie. It is looked up on every
 * request (lib/owner/store.ts), so removing an owner's link takes effect at
 * once, without waiting for the session to expire.
 *
 * Token: `v1.<base64url JSON {id, name, exp, n}>.<base64url HMAC-SHA256>`,
 * httpOnly, keyed by a value derived from VORTALY_KEY_SECRET. Development falls
 * back to a fixed key so the flow can be tried locally.
 */

export const OWNER_SESSION_COOKIE = "vortaly.owner";
export const OWNER_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface OwnerSession {
  telegramId: number;
  name: string;
}

function signingKey(): Buffer | null {
  const secret = process.env.VORTALY_KEY_SECRET?.trim();
  const base = secret || (process.env.NODE_ENV !== "production" ? "vortaly-dev-only-key-secret" : "");
  if (!base) return null;
  // Its own derivation, so this key never equals the one that seals AI keys.
  return createHash("sha256").update(`owner-session:${base}`).digest();
}

export function ownerSessionsEnabled(): boolean {
  return signingKey() !== null;
}

function sign(key: Buffer, body: string): string {
  return createHmac("sha256", key).update(body).digest("base64url");
}

export function issueOwnerSession(owner: OwnerSession, now: number = Date.now()): string | null {
  const key = signingKey();
  if (!key) return null;
  const body = Buffer.from(
    JSON.stringify({
      id: owner.telegramId,
      name: owner.name.slice(0, 64),
      exp: Math.floor(now / 1000) + OWNER_SESSION_TTL_SECONDS,
      n: randomBytes(9).toString("base64url"),
    }),
  ).toString("base64url");
  return `v1.${body}.${sign(key, body)}`;
}

export function readOwnerSession(request: Request, now: number = Date.now()): OwnerSession | null {
  const key = signingKey();
  const token = readCookie(request, OWNER_SESSION_COOKIE);
  if (!key || !token) return null;

  const [version, body, signature] = token.split(".");
  if (version !== "v1" || !body || !signature) return null;

  const expected = Buffer.from(sign(key, body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      id?: unknown;
      name?: unknown;
      exp?: unknown;
    };
    if (typeof data.exp !== "number" || data.exp <= Math.floor(now / 1000)) return null;
    if (typeof data.id !== "number" || !Number.isSafeInteger(data.id) || data.id <= 0) return null;
    return { telegramId: data.id, name: typeof data.name === "string" ? data.name : "" };
  } catch {
    return null;
  }
}

/** Cookie options shared by sign-in and sign-out. */
export function ownerCookie(value: string, maxAge: number) {
  return {
    name: OWNER_SESSION_COOKIE,
    value,
    httpOnly: true,
    // `lax`, not `strict`: an owner arrives from a link tapped in Telegram,
    // which is a cross-site navigation, and must land already signed in.
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
