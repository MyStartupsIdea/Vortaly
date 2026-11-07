import { NextRequest, NextResponse } from "next/server";
import {
  findSalonBySlug,
  isValidSlug,
  validateSlug,
  isNetworkError,
} from "@/lib/supabase/salons";
import type { SalonRecord } from "@/lib/supabase/salons";

/**
 * Public tenant-resolution endpoint.
 *
 * GET /api/tenant/<slug>
 *
 * Returns the salon record for a given subdomain slug, or 404 if the slug does
 * not map to a tenant. Used by:
 *  - the platform dashboard to preview a tenant
 *  - any service that needs to verify a tenant exists by its canonical subdomain
 *
 * This endpoint does NOT require auth — the salon catalogue is public by schema
 * design (see supabase/schema.sql "catalogue is readable" policy).
 *
 * Validation:
 *  - Slug is validated against DNS-label rules before hitting the database
 *    (no injection, no overly long or short labels, no weird characters).
 *  - If the slug is invalid, returns 400 with a descriptive error.
 *  - If Supabase is unreachable (network error), returns 503 "service
 *    unavailable" rather than 404 "not found", so callers can distinguish
 *    between "tenant does not exist" and "the platform is degraded".
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // --- Input validation ---
  if (typeof slug !== "string" || slug.length === 0) {
    return NextResponse.json(
      { error: "slug is required", example: "chinor-tashkent" },
      { status: 400 },
    );
  }

  const validationError = validateSlug(slug);
  if (validationError) {
    return NextResponse.json(
      { error: validationError, example: "chinor-tashkent" },
      { status: 400 },
    );
  }

  // isValidSlug is kept as a fast pre-check (cheaper than validateSlug on
  // hot paths such as middleware). Both must agree, but validateSlug is the
  // source of truth for the public endpoint because it gives detailed errors.
  if (!isValidSlug(slug)) {
    // Should be unreachable given validateSlug above, but defensive.
    return NextResponse.json(
      { error: "Invalid tenant slug", example: "chinor-tashkent" },
      { status: 400 },
    );
  }

  // --- Tenant lookup ---
  let salon: SalonRecord | null;
  try {
    salon = await findSalonBySlug(slug);
  } catch (err) {
    // findSalonBySlug catches its own network errors and returns null, but
    // be defensive: if something propagates out, degrade.
    if (isNetworkError(err)) {
      return NextResponse.json(
        {
          error: "Service temporarily unavailable",
          slug,
          hint: "Supabase appears to be unreachable; the tenant may exist but cannot be verified right now.",
        },
        { status: 503 },
      );
    }
    console.error("[tenant.GET] unexpected findSalonBySlug error:", err);
    return NextResponse.json(
      { error: "Internal error", slug, hint: "Please try again later." },
      { status: 500 },
    );
  }

  if (!salon) {
    return NextResponse.json(
      {
        error: "Tenant not found",
        slug,
        hint: "Point DNS for <slug>.uzmini.uz first, or create the tenant via POST /api/admin/salons.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    tenant: {
      id: salon.id,
      name: salon.name,
      subdomain: `${salon.id}.uzmini.uz`,
      url: `https://${salon.id}.uzmini.uz`,
      taglineRu: salon.tagline_ru,
      taglineUz: salon.tagline_uz,
      addressRu: salon.address_ru,
      addressUz: salon.address_uz,
      phone: salon.phone,
      rating: salon.rating,
      reviewCount: salon.review_count,
      openFrom: salon.open_from,
      openTo: salon.open_to,
      createdAt: salon.created_at,
    },
    resolvedBy: "api",
  });
}
