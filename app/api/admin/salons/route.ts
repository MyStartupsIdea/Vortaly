import { NextRequest, NextResponse } from "next/server";
import { createSalon, type SalonRecord, isNetworkError, validateSlug } from "@/lib/supabase/salons";
import { getSupabaseServer } from "@/lib/supabase/server";
import { tenantHost, tenantUrl } from "@/lib/domain/config";
import { adminAuthorized } from "@/lib/domain/admin-auth";

/**
 * Platform-admin endpoint for tenant (salon) lifecycle.
 *
 * GET  /api/admin/salons          → list all salons (platform dashboard)
 * POST /api/admin/salons          → create a new tenant / mini-app
 *
 * Auth model (default-closed), implemented in lib/domain/admin-auth.ts:
 *  - Both endpoints require `PLATFORM_ADMIN_SECRET` via
 *    `Authorization: Bearer <secret>` or the legacy header
 *    `x-platform-admin-secret`. A browser never sees the secret: it presents
 *    the httpOnly session cookie given by `POST /api/admin/session`.
 *
 * Default-closed behaviour (deliberate, not a bug):
 *  - If `PLATFORM_ADMIN_SECRET` is not configured on the server, every
 *    request is refused with 401. The client is expected to surface that as
 *    "admin authorization required" rather than silently substituting demo
 *    data for real data.
 *
 * Security notes:
 *  - On failure we only say "access denied". The secret is never logged or
 *    echoed back.
 *  - Cookie-based sessions are httpOnly; the browser can send them but cannot
 *    read the underlying secret.
 *
 * Remaining work before prod:
 *  - Replace the shared secret with a real admin session / platform API client
 *    model once that exists.
 *  - Validate phone format, name length, slug uniqueness more strictly.
 *  - Ensure the caller is allowed to create a tenant (platform owner / reseller).
 */

function adminAuthFailed() {
  return NextResponse.json(
    { error: "access denied", hint: "platform-admin secret required" },
    { status: 401 },
  );
}

export async function GET(request: Request) {
  if (!adminAuthorized(request)) {
    return adminAuthFailed();
  }

  try {
    const db = getSupabaseServer();
    if (!db) {
      return NextResponse.json(
        { salons: [], warning: "Supabase not configured — list is empty" },
        { status: 200 },
      );
    }

    const { data, error } = await db
      .from("salons")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      const code = typeof error.code === "string" ? error.code : undefined;
      if (code && /^5\d{2}$/.test(code)) {
        return NextResponse.json(
          { salons: [], warning: "Supabase temporarily unavailable" },
          { status: 200 },
        );
      }
      return NextResponse.json({ salons: [], warning: error.message ?? ".query failed" }, { status: 200 });
    }

    if (!data) {
      return NextResponse.json({ salons: [], warning: "No salons found" }, { status: 200 });
    }

    const salons: SalonRecord[] = data.map((row) => ({
      id: row.id,
      name: row.name,
      tagline: { ru: row.tagline_ru, uz: row.tagline_uz },
      address: { ru: row.address_ru, uz: row.address_uz },
      phone: row.phone,
      rating: row.rating ?? 0,
      reviewCount: row.review_count ?? 0,
      openFrom: row.open_from,
      openTo: row.open_to,
      createdAt: row.created_at,
    }));

    return NextResponse.json({ salons }, { status: 200 });
  } catch (err) {
    // Network-level failures (fetch failed, DNS, timeout) should not crash
    // the platform-admin dashboard — return a graceful empty list with a
    // warning so the operator sees the platform is degraded.
    if (isNetworkError(err)) {
      console.warn("[admin.salons.GET] Supabase network error, degrading to empty list");
      return NextResponse.json(
        { salons: [], warning: "Supabase unavailable — list is temporarily empty" },
        { status: 200 },
      );
    }
    console.error("[admin.salons.GET] unexpected error:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { salons: [], warning: "Failed to load salons — please try again" },
      { status: 200 },
    );
  }
}

interface CreateBody {
  name: string;
  taglineRu?: string;
  taglineUz?: string;
  addressRu?: string;
  addressUz?: string;
  phone?: string;
  slug?: string;
}

const DEFAULT_TAGLINE_RU = "Салон красоты и барбершоп";
const DEFAULT_TAGLINE_UZ = "Salon va barbershop";

export async function POST(request: NextRequest) {
  // Authorization first, before the body is read or validated: an
  // unauthenticated caller must not be able to probe the validation rules, and
  // must not get a request body parsed on its behalf.
  if (!adminAuthorized(request)) {
    return adminAuthFailed();
  }

  try {
    let body: CreateBody;
    try {
      body = (await request.json()) as CreateBody;
    } catch {
      return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
    }

    if (!body.name || typeof body.name !== "string" || body.name.trim().length < 2) {
      return NextResponse.json({ error: "name is required (min 2 characters)" }, { status: 400 });
    }

    if (!body.phone) {
      return NextResponse.json({ error: "phone is required" }, { status: 400 });
    }

    const name = body.name.trim();
    const phone = String(body.phone).replace(/[^\d+]/g, "");

    if (!/^(\+?998)?\d{9}$/.test(phone)) {
      return NextResponse.json({ error: "phone must be a valid Uzbek number (e.g. +998901234567)" }, { status: 400 });
    }

    if (body.slug) {
      const slugError = validateSlug(body.slug);
      if (slugError) {
        return NextResponse.json({ error: slugError }, { status: 400 });
      }
    }

    const result = await createSalon({
      name,
      taglineRu: body.taglineRu?.trim() || DEFAULT_TAGLINE_RU,
      taglineUz: body.taglineUz?.trim() || DEFAULT_TAGLINE_UZ,
      addressRu: body.addressRu?.trim() || "",
      addressUz: body.addressUz?.trim() || "",
      phone,
      slug: body.slug,
    });

    const status = result.persisted ? 201 : 202;
    return NextResponse.json(
      {
        slug: result.slug,
        id: result.id,
        persisted: result.persisted,
        subdomain: tenantHost(result.slug),
        urls: {
          tenant: tenantUrl(result.slug),
        },
        warning: result.warning,
      },
      { status },
    );
  } catch (err) {
    // createSalon already handles network errors gracefully, but in case
    // something unexpected propagates from the outer handler (e.g. JSON parse
    // failures that weren't caught), degrade here too.
    if (isNetworkError(err)) {
      console.warn("[admin.salons.POST] Supabase network error (outer handler)");
      return NextResponse.json(
        { error: "Supabase unavailable — could not create salon", warning: "Please try again" },
        { status: 503 },
      );
    }
    console.error("[admin.salons.POST] unexpected error:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: "Internal error — could not create salon", warning: "Please try again" },
      { status: 500 },
    );
  }
}
