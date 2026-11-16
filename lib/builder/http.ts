import "server-only";

import { NextResponse } from "next/server";
import { adminAuthorized } from "@/lib/domain/admin-auth";
import { isValidSlug } from "@/lib/supabase/salons";

/**
 * Shared front door for /api/builder/*.
 *
 * The builder writes tenant content and spends model quota, so every route is
 * behind the same platform-admin gate as /api/admin/*: the httpOnly session
 * cookie from POST /api/admin/session, or the secret in a header for tooling.
 */

const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** Returns the slug, or the response to send instead. */
export async function guard(
  request: Request,
  params: Promise<{ slug: string }>,
): Promise<{ slug: string } | { response: NextResponse }> {
  if (!adminAuthorized(request)) {
    return { response: json({ error: "access denied" }, 401) };
  }
  const { slug } = await params;
  if (!isValidSlug(slug)) return { response: json({ error: "invalid slug" }, 400) };
  return { slug };
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
