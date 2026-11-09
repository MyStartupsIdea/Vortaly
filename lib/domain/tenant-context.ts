import { NextResponse } from "next/server";

/**
 * The tenant a request belongs to, as resolved by the server.
 *
 * `proxy.ts` parses the host, looks the slug up in Postgres, and stamps
 * the result on `x-salon-id` — after deleting any copy of that header the
 * caller may have sent. Downstream code therefore sees a host-derived salon id
 * or nothing at all, and this module is the only place that reads it, so the
 * rule cannot drift between endpoints.
 */

/** The header the middleware stamps. Never read it by name elsewhere. */
const TENANT_HEADER = "x-salon-id";

/**
 * The resolved tenant, or null.
 *
 * The middleware always sets the header: to the salon id, or to an empty
 * string when the host is the platform origin, an unknown subdomain, or the
 * lookup was degraded. An empty or whitespace-only value is therefore "no
 * tenant" — and the answer is to refuse, never to fall back to a default
 * salon, because a default would silently write one tenant's data into
 * another's.
 */
export function resolvedSalonId(request: Request): string | null {
  const salonId = request.headers.get(TENANT_HEADER)?.trim();
  return salonId ? salonId : null;
}

/** Stable refusal for a request that arrived without a resolved tenant. */
export function tenantNotResolved(hint: string): NextResponse {
  return NextResponse.json({ error: "Tenant not resolved", hint }, { status: 403 });
}
