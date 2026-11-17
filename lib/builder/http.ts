import "server-only";

import { NextResponse } from "next/server";
import { adminAuthorized } from "@/lib/domain/admin-auth";
import { readOwnerSession } from "@/lib/owner/session";
import { ownsSlug } from "@/lib/owner/store";
import { isValidSlug } from "@/lib/supabase/salons";

/**
 * Shared front door for /api/builder/*.
 *
 * The builder writes tenant content and spends model quota, so every route is
 * gated. Two kinds of caller get in:
 *  - the platform operator (the same gate as /api/admin/*: the httpOnly
 *    session cookie from POST /api/admin/session, or the secret in a header),
 *    for every business;
 *  - a business owner signed in with Telegram (lib/owner/session.ts), for the
 *    businesses linked to their account only. Anything else answers 401, the
 *    same as no session, so a stranger learns nothing about which slugs exist.
 */

export type Viewer = "admin" | "owner";

const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** Returns the slug, or the response to send instead. */
export async function guard(
  request: Request,
  params: Promise<{ slug: string }>,
): Promise<{ slug: string; viewer: Viewer } | { response: NextResponse }> {
  const { slug } = await params;
  if (!isValidSlug(slug)) return { response: json({ error: "invalid slug" }, 400) };

  if (adminAuthorized(request)) return { slug, viewer: "admin" };

  const owner = readOwnerSession(request);
  if (owner && (await ownsSlug(owner.telegramId, slug))) return { slug, viewer: "owner" };

  return { response: json({ error: "access denied" }, 401) };
}

export async function readObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Storage failures, in words an operator can act on. */
export function storageFailure(
  reason: "unavailable" | "schema_missing" | "no_tenant" | "missing",
): NextResponse {
  if (reason === "missing") return json({ error: "site_not_found" }, 404);
  if (reason === "no_tenant") return json({ error: "tenant_not_found" }, 404);
  if (reason === "schema_missing") {
    return json(
      {
        error: "schema_missing",
        hint: "The `sites` table does not exist. Apply the builder section of supabase/schema.sql.",
      },
      503,
    );
  }
  return json({ error: "storage_unavailable" }, 503);
}

/**
 * The free AI allowance is spent and the site has no key of its own.
 * 402 is deliberate: the request was fine, it is payment (a key) that is missing.
 */
export function keyRequired(): NextResponse {
  return json({ error: "ai_key_required" }, 402);
}
