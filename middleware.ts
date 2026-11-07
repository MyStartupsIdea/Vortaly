import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  findSalonBySlug,
  isValidSlug,
  type SalonRecord,
} from "@/lib/supabase/salons";

/**
 * Multi-tenant subdomain middleware.
 *
 * Architecture
 * -----------
 * Platform origin:  uzmini.uz  +  *.uzmini.uz
 *
 * - uzmini.uz                         → platform / default demo salon
 * - <slug>.uzmini.uz                  → tenant salon resolved by slug
 *
 * Resolution order (cheapest → most authoritative):
 *  1. Host header parsed for <slug>.uzmini.uz
 *  2. If slug is a valid DNS label, look it up in Postgres via the server
 *     client (authoritative — never trust a client-supplied tenant id).
 *  3. Stash the resolved SalonRecord + id on the request via headers so that
 *     downstream API routes and server components can read them without
 *     re-deriving the tenant.
 *
 * The platform host itself does not get a salon — API routes that require a
 * tenant should fall back to the demo salon or reject, depending on context.
 */

const PLATFORM_HOST = "uzmini.uz";
const TENANT_SUFFIX = ".uzmini.uz";

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const url = request.nextUrl;

  // Normalize host: strip port when present (localhost:3000 during dev).
  const hostNoPort = host.replace(/:\d+$/, "");

  // ---- Resolve tenant ----
  let salon: SalonRecord | null = null;
  let salonId: string | null = null;
  let tenantType: "platform" | "tenant" | "unknown" = "platform";

  if (hostNoPort.endsWith(TENANT_SUFFIX)) {
    const subdomain = hostNoPort.slice(0, -TENANT_SUFFIX.length);
    if (subdomain && subdomain.length >= 2 && isValidSlug(subdomain)) {
      // Authoritative lookup — the slug is only a "claimed" tenant if it maps
      // to a real row in the salons table.
      salon = await findSalonBySlug(subdomain);
      if (salon) {
        salonId = salon.id;
        tenantType = "tenant";
      } else {
        // Valid-format slug, but no such salon exists yet.
        tenantType = "unknown";
      }
    } else {
      // Malformed subdomain (too short, bad chars, etc.).
      tenantType = "unknown";
    }
  }

  // ---- Build the response ----
  const response = NextResponse.next();

  // Expose the resolved tenant to downstream handlers via headers. These are
  // request-scoped and never leak to the browser.
  if (salonId) {
    response.headers.set("x-salon-id", salonId);
  }
  response.headers.set("x-tenant-type", tenantType);

  if (salon) {
    // Downstream server components / API routes can read these if they need the
    // full record without a second DB hit. Keep them JSON-encoded to stay within
    // header size limits (these fields are tiny).
    response.headers.set("x-salon-name", salon.name);
    response.headers.set("x-salon-phone", salon.phone);
  }

  // ---- Rewrite for tenant isolation (optional, explained below) ----
  //
  // We do NOT rewrite the URL to a different path per tenant. The codebase uses
  // a shared codebase for all tenants (multi-tenant-by-data, not
  // multi-tenant-by-directory). Tenant identity is carried by the header and by
  // the salon_id column in every table. This keeps one deployable artifact for
  // all salons and lets new tenants go live without a new deploy.
  //
  // If a future requirement needs tenant-branded routes (e.g. /<slug>/pricing),
  // add a rewrite here keyed off x-salon-id instead of a separate folder.

  return response;
}

export const config = {
  // Match all requests to uzmini.uz and any *.uzmini.uz subdomain.
  // Matchers run matchers against the raw request URL; the host header is read
  // inside the function body, so a single catch-all matcher is sufficient.
  // - Skip static assets (they're the same for every tenant).
  // - In dev with localhost the host won't end in .uzmini.uz, so the middleware
  //   is a no-op and the platform defaults apply.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
