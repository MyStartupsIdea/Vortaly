import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  adminAuthConfigured,
  adminAuthorized,
  adminSecretMatches,
  issueAdminSession,
} from "@/lib/domain/admin-auth";

/**
 * Exchanges the platform-admin secret for an httpOnly session cookie, so the
 * browser console can reach `/api/admin/*` without the secret ever being sent
 * to, stored in, or bundled into the client.
 *
 *   GET    /api/admin/session  → { configured, authorized }  (no credential)
 *   POST   /api/admin/session  → { secret } ⇒ Set-Cookie     (unlock)
 *   DELETE /api/admin/session  → clears the cookie           (lock)
 *
 * The secret travels exactly once per session, in a POST body over the same
 * transport as every other request. That is the one direction that is safe:
 * server-bound. Nothing here echoes it back, logs it, or puts it in a URL
 * (which would land in access logs and browser history).
 *
 * This endpoint does not widen what `/api/admin/*` grants. A caller who does
 * not know the secret gets exactly as far as before: nowhere.
 */

/** Cookie lifetime is the token lifetime; the signed expiry is authoritative. */
const COOKIE_MAX_AGE = ADMIN_SESSION_TTL_SECONDS;

// ---------------------------------------------------------------- throttle ---
//
// A small fixed-window limit on failed unlock attempts. It is per server
// instance and keyed on a forwarded client address, so it is defence in depth
// rather than a guarantee: a serverless deployment may run several instances,
// and `x-forwarded-for` can be spoofed. The real protection is that
// PLATFORM_ADMIN_SECRET is a long random value, which is why .env.example says
// to generate one.

const MAX_FAILURES = 10;
const WINDOW_MS = 10 * 60 * 1000;

const failures = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function throttled(key: string, now: number): boolean {
  const entry = failures.get(key);
  if (!entry || entry.resetAt <= now) return false;
  return entry.count >= MAX_FAILURES;
}

function recordFailure(key: string, now: number): void {
  const entry = failures.get(key);
  if (!entry || entry.resetAt <= now) {
    failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

/** Keeps the map from growing without bound on a long-lived instance. */
function sweep(now: number): void {
  for (const [key, entry] of failures) {
    if (entry.resetAt <= now) failures.delete(key);
  }
}

// ----------------------------------------------------------------- handlers ---

export async function GET(request: Request) {
  // Reports only whether this browser is already unlocked and whether the
  // deployment has an admin secret at all. Neither is a credential, and the
  // console needs both to say something true to the operator.
  return NextResponse.json(
    { configured: adminAuthConfigured(), authorized: adminAuthorized(request) },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const now = Date.now();
  sweep(now);

  if (!adminAuthConfigured()) {
    // Default-closed. This is a deployment fault, not a wrong credential, and
    // saying so is what lets the operator fix it instead of guessing at the
    // value of a secret that does not exist.
    return NextResponse.json(
      {
        error: "admin auth not configured",
        hint: "Set PLATFORM_ADMIN_SECRET server-side, then restart the server.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const key = clientKey(request);
  if (throttled(key, now)) {
    return NextResponse.json(
      { error: "too many attempts" },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "600" } },
    );
  }

  let secret: unknown;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
    }
    secret = (body as { secret?: unknown }).secret;
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  if (!adminSecretMatches(secret)) {
    recordFailure(key, now);
    // Same body as every other admin refusal: no hint about length, prefix or
    // whether a secret is set.
    return NextResponse.json(
      { error: "access denied" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const token = issueAdminSession(now);
  if (!token) {
    // Only reachable if the secret disappeared between the two checks above.
    return NextResponse.json({ error: "admin auth not configured" }, { status: 503 });
  }

  const response = NextResponse.json(
    { authorized: true, expiresInSeconds: COOKIE_MAX_AGE },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );

  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    // `strict` is right for an operator console: nothing third-party should
    // ever be able to drive these endpoints from another site.
    sameSite: "strict",
    // Over plain HTTP on localhost a Secure cookie would never be stored, so
    // the flag follows the environment rather than being dropped in both.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json(
    { authorized: false },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );

  // Expire it rather than only deleting, so a browser that ignores one still
  // drops the value.
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}
