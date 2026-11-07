import { NextRequest, NextResponse } from "next/server";
import { setBookingStatus } from "@/lib/supabase/bookings";
import type { BookingStatus } from "@/lib/types";

/**
 * PATCH /api/bookings/<id>/status
 *
 * Changes a booking's status, tenant-scoped via the x-salon-id header set by
 * the subdomain middleware (middleware.ts).
 *
 * Body: { status: "confirmed" | "paid" | "cancelled" | "pending" | "draft" }
 *
 * The middleware must have resolved a tenant for this to succeed — if
 * x-salon-id is missing the request is rejected rather than falling back to a
 * demo salon. Status mutations are a salon-owner operation and should not run
 * against an unresolved tenant.
 *
 * Tenant isolation happens two ways:
 *  1. The x-salon-id header (from the subdomain the owner is logged into).
 *  2. setBookingStatus itself also WHERE-clauses on salon_id, so even if the
 *     header were somehow wrong, the UPDATE touches only rows matching both
 *     the booking id AND the salon id.
 *
 * SECURITY (TODO before prod):
 *  - Authenticate the caller (salon owner session / platform admin). Right now
 *    this trusts x-salon-id from the middleware, which itself trusts the
 *    subdomain. Plausible for an MVP where the owner only acts from their own
 *    subdomain, but a real owner auth is needed before this is exposed.
 *  - Validate status transitions (e.g. paid -> pending should be rejected).
 *  - Idempotency / replay protection for payment callbacks.
 */

const ALLOWED_STATUSES: BookingStatus[] = [
  "draft",
  "pending",
  "confirmed",
  "paid",
  "cancelled",
];

function badStatus(status: unknown): NextResponse {
  return NextResponse.json(
    { error: `Invalid or missing status`, allowed: ALLOWED_STATUSES },
    { status: 400 },
  );
}

function conflicting(req: NextRequest): NextResponse {
  return NextResponse.json(
    {
      error: "Tenant not resolved",
      hint: "This endpoint requires a valid *.uzmini.uz subdomain. Request the booking owner's domain.",
    },
    { status: 403 },
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // The middleware resolves the tenant for *.uzmini.uz requests and stashes
  // the salon id on x-salon-id. Status mutations require a resolved tenant —
  // no fallback to the demo salon here.
  const salonId =
    request.headers.get("x-salon-id") as string | null;
  if (!salonId || !salonId.length) {
    return conflicting(request);
  }

  let body: { status?: string };
  try {
    body = (await request.json()) as { status?: string };
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const wanted = body.status;
  if (!wanted || typeof wanted !== "string") return badStatus(body.status);

  if (!ALLOWED_STATUSES.includes(wanted as BookingStatus)) {
    return badStatus(wanted);
  }

  // booking id comes from the URL dynamic segment.
  const { id: bookingId } = await params;
  if (!bookingId || bookingId.length < 1) {
    return NextResponse.json({ error: "booking id is required in the URL" }, { status: 400 });
  }

  const result = await setBookingStatus(bookingId, wanted as BookingStatus, salonId);

  if (result.updated) {
    return NextResponse.json({ ok: true, status: wanted });
  }

  // Distinguish an infrastructure fault from a not-found so callers can retry
  // instead of assuming the booking does not exist.
  if ("reason" in result && result.reason === "degraded") {
    return NextResponse.json(
      { error: "Booking service temporarily unavailable" },
      { status: 503 },
    );
  }

  // Not found, or the booking belongs to a different tenant — both are
  // indistinguishable to the caller on purpose (no cross-tenant existence leak).
  return NextResponse.json(
    { error: "Booking not found or access denied" },
    { status: 404 },
  );
}

// GET is not implemented: status should be changed only via a mutation, never
// via a read verb. Return 405 to be explicit.
export async function GET(_request: NextRequest) {
  return NextResponse.json({ error: "Method not allowed. Use PATCH." }, { status: 405 });
}
