import { ownerListBookings } from "@/lib/domain/owner-auth";

/**
 * GET /api/owner/bookings
 *
 * Lists the bookings of the salon the authenticated owner (or manager) is
 * linked to. The salon is resolved from `salon_owners` for the session uid, so
 * the response can only ever contain that salon's rows.
 *
 * Optional `?salonId=<id>` narrows the scope and is required when the account
 * is linked to more than one salon. It is a filter, not a credential: a salon
 * the session is not linked to yields 403.
 *
 * 401 no session · 403 not entitled · 400 several salons, none named ·
 * 503 Supabase degraded.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return ownerListBookings(request);
}
