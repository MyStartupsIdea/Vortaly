import { NextRequest, NextResponse } from "next/server";
import { createSalon, type SalonRecord, isNetworkError, validateSlug } from "@/lib/supabase/salons";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * Platform-admin endpoint for tenant (salon) lifecycle.
 *
 * GET  /api/admin/salons          → list all salons (platform dashboard)
 * POST /api/admin/salons          → create a new tenant / mini-app
 *
 * SECURITY (TODO before prod):
 *  - Guard with platform-admin auth (platform-owner session or signed platform
 *    API key in Authorization). Right now this runs without auth so it is usable
 *    in development; in production it MUST reject unauthenticated requests.
 *  - Validate phone format, name length, slug uniqueness more strictly.
 *  - Ensure the caller is allowed to create a tenant (platform owner / reseller).
 */

export async function GET() {
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
      tagline_ru: row.tagline_ru,
      tagline_uz: row.tagline_uz,
      address_ru: row.address_ru,
      address_uz: row.address_uz,
      phone: row.phone,
      rating: row.rating ?? 0,
      review_count: row.review_count ?? 0,
      open_from: row.open_from,
      open_to: row.open_to,
      created_at: row.created_at,
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
        subdomain: `${result.slug}.uzmini.uz`,
        urls: {
          tenant: `https://${result.slug}.uzmini.uz`,
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
