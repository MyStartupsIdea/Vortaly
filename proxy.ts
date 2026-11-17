import { NextRequest, NextResponse } from "next/server";
import {
  findSalonBySlug,
  findSalonBySlugFound,
  findSalonBySlugRecord,
  findSalonBySlugUnavailable,
  isValidSlug,
  type SalonRecord,
} from "@/lib/supabase/salons";
import { ROOT_DOMAIN, TENANT_SUBDOMAINS_ENABLED, TENANT_SUFFIX } from "@/lib/domain/config";

/**
 * Multi-tenant subdomain proxy (Next 16 renamed middleware.ts -> proxy.ts).
 *
 * Architecture
 * -----------
 * Platform origin:  <ROOT_DOMAIN>  +  *.<ROOT_DOMAIN>
 *
 * - <ROOT_DOMAIN>                     → platform / default demo salon
 * - <slug>.<ROOT_DOMAIN>              → tenant salon resolved by slug
 *
 * <ROOT_DOMAIN> is never a literal here: it comes from NEXT_PUBLIC_ROOT_DOMAIN
 * through lib/domain/config.ts, so one env var moves the platform and every
 * tenant host together.
 *
 * Resolution order (cheapest → most authoritative):
 *  1. Host header parsed for <slug>.<ROOT_DOMAIN>
 *  2. If slug is a valid DNS label, look it up in Postgres via the server
 *     client (authoritative — never trust a client-supplied tenant id).
 *  3. Build a new `Headers` copy from the incoming request, delete any
 *     client-supplied tenant headers, set only the server-authoritative ones,
 *     and pass that copy to `NextResponse.next({ request: { headers } })`.
 *
 * Why not mutate `request.headers`:
 *  - We are on Next.js 16.4.5, where the documented proxy escape hatch is
 *    `NextResponse.next({ request: { headers } })`. Mutating `request.headers` is
 *    not the API we intend to rely on, so we never mutate the request object and
 *    this file has no `@ts-expect-error` suppressions for header writes.
 *
 * Security: any client-supplied `x-salon-id` / `x-tenant-type` is removed before
 * we add our own, so downstream can only ever see the host-scoped tenant id, never
 * one chosen by the caller.
 *
 * Information disclosure: we pass only tenant id and tenant type. We do not send
 * the full tenant profile (name, phone, etc.) in request headers.
 */

const PLATFORM_HOST = ROOT_DOMAIN;

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const url = request.nextUrl;

  // Normalize host: strip port when present (localhost:3000 during dev).
  const hostNoPort = host.replace(/:\d+$/, "");

  // ---- Resolve tenant ----
  let salon: SalonRecord | undefined = undefined;
  let salonId: string | null = null;
  let tenantType: "platform" | "tenant" | "unknown" = "platform";

  if (TENANT_SUBDOMAINS_ENABLED && hostNoPort.endsWith(TENANT_SUFFIX)) {
    const subdomain = hostNoPort.slice(0, -TENANT_SUFFIX.length);
    if (subdomain && subdomain.length >= 2 && isValidSlug(subdomain)) {
      // Authoritative lookup — the slug is only a "claimed" tenant if it maps
      // to a real row in the salons table.
      const lookup = await findSalonBySlug(subdomain);

      if (findSalonBySlugUnavailable(lookup)) {
        // If the DB is unreachable we still do not leak a tenant id. Here we
        // cannot safely pick one, so this host is treated as unresolved.
        tenantType = "unknown";
        if (salon) {
          // Keep a stale record only for logs, never for tenant resolution.
          console.error(
            `[proxy] unexpected state for ${hostNoPort}: unresolved tenant but stale record present`,
          );
          salon = undefined;
        }
      } else if (findSalonBySlugFound(lookup)) {
        salon = findSalonBySlugRecord(lookup);
        if (!salon) {
          // The lookup said "found" but the record shape is missing — treat
          // this as unresolved instead of asserting our way past it.
          tenantType = "unknown";
          salon = undefined;
        } else {
          salonId = salon.id;
          tenantType = "tenant";
        }
      } else {
        // Valid-format slug, but no such salon exists yet.
        tenantType = "unknown";
      }
    } else {
      // Malformed subdomain (too short, bad chars, etc.).
      tenantType = "unknown";
    }
  }

  // ---- Path-addressed tenants on the platform host ----
  //
  // Until wildcard DNS exists, a tenant is opened at <platform>/<slug>, not at
  // <slug>.<ROOT_DOMAIN>, so the host says nothing about which tenant an API
  // call is for. The Mini App therefore names it in `x-vortaly-tenant`.
  //
  // This grants nothing the subdomain does not: anyone can already address any
  // tenant by visiting its host. The claimed slug gets the same authoritative
  // database lookup, booking contents are still bound to that tenant's own
  // catalogue, and reading bookings still needs verified Telegram identity.
  // A tenant subdomain always wins — the header is ignored there.
  if (tenantType === "platform" && url.pathname.startsWith("/api/")) {
    const claimed = request.headers.get("x-vortaly-tenant")?.trim().toLowerCase();
    if (claimed && isValidSlug(claimed)) {
      const lookup = await findSalonBySlug(claimed);
      if (findSalonBySlugFound(lookup)) {
        salonId = findSalonBySlugRecord(lookup)?.id ?? null;
        if (salonId) tenantType = "tenant";
      } else if (
        process.env.NODE_ENV !== "production" &&
        (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY)
      ) {
        // Local trial with no database at all: there is nothing to look the
        // slug up in, and nothing can be persisted either. The booking API
        // answers from the local draft store and reports the booking unsaved.
        salonId = claimed;
        tenantType = "tenant";
      }
    }
  }

  // ---- Build the request headers for the downstream pass ----
  // We copy-paste the incoming request's headers into a fresh `Headers` object so
  // that we can safely remove client-supplied tenant headers and inject only the
  // server-authoritative ones without mutating `request.headers`.
  let downstreamHeaders: Headers;
  try {
    downstreamHeaders = new Headers(request.headers);
  } catch (err) {
    // Fallback: if the incoming headers object is not a real `Headers` instance,
    // start from an empty headers bag and re-add only what is needed. We keep the
    // fallback minimal because in that case even the core headers may differ.
    downstreamHeaders = new Headers();
  }

  // Strip any tenant identity the caller may have sent.
  downstreamHeaders.delete("x-vortaly-tenant");
  downstreamHeaders.delete("x-salon-id");
  downstreamHeaders.delete("x-tenant-type");

  if (salonId) {
    downstreamHeaders.set("x-salon-id", salonId);
    downstreamHeaders.set("x-tenant-type", tenantType);
  } else {
    downstreamHeaders.set("x-salon-id", "");
    downstreamHeaders.set("x-tenant-type", "unknown");
  }

  const response = NextResponse.next({ request: { headers: downstreamHeaders } });

  // Do not expose the full tenant profile downstream. Only the resolved tenant id
  // and the tenant type are passed on; name, phone and other fields stay internal.


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
  // Match all requests to <ROOT_DOMAIN> and any *.<ROOT_DOMAIN> subdomain.
  // Matchers run matchers against the raw request URL; the host header is read
  // inside the function body, so a single catch-all matcher is sufficient.
  // - Skip static assets (they're the same for every tenant).
  // - In dev with localhost the host will not end in .<ROOT_DOMAIN>, so the proxy
  //   is a no-op and the platform defaults apply.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
