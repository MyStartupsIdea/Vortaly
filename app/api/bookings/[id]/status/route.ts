import { NextRequest, NextResponse } from "next/server";
import { ownerSetBookingStatus } from "@/lib/domain/owner-auth";
import { resolvedSalonId } from "@/lib/domain/tenant-context";

/**
 * PATCH /api/bookings/<id>/status  —  deprecated alias.
 *
 * Use `PATCH /api/owner/bookings/<id>/status`. This path is kept so existing
 * clients do not break, and it now enforces the same authorization.
 *
 * Why it changed
 * --------------
 * It used to authorize on the `x-salon-id` header alone. That header is
 * server-set (the subdomain middleware strips any client copy), so it did
 * prove *which tenant* the request came from — but it proved nothing about
 * *who* was asking. Any visitor of a salon's public subdomain could PATCH any
 * booking id of that salon to `paid` or `cancelled`: the Mini App is a public
 * surface, and a booking id is a uuid in a URL the customer already holds.
 *
 * Now the caller must present a salon-owner session (`lib/domain/owner-auth.ts`)
 * and the booking must belong to that owner's salon. When the request also
 * arrives on a tenant subdomain, the resolved tenant is passed as an extra
 * constraint: an owner acting from someone else's subdomain is refused rather
 * than silently served their own salon.
 *
 * Status transitions are validated against the current row, and tenant
 * isolation holds at three levels:
 *  1. the owner session resolves the salon from `salon_owners`;
 *  2. the pre-read is filtered by `salon_id`, so a booking of another tenant
 *     is indistinguishable from one that does not exist (404 either way);
 *  3. the UPDATE itself is WHERE-clause-filtered on both id and salon_id.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  // The proxy resolves the tenant for *.<ROOT_DOMAIN> requests and stamps it
  // on x-salon-id (empty when the host is not a known tenant). When present it
  // can only narrow access: the salon actually granted always comes from the
  // owner row.
  const tenant = resolvedSalonId(request);

  return ownerSetBookingStatus(
    request,
    context,
    tenant ? { requiredSalonId: tenant } : undefined,
  );
}

// GET is not implemented: status should be changed only via a mutation, never
// via a read verb. Return 405 to be explicit.
export async function GET(_request: NextRequest) {
  return NextResponse.json({ error: "Method not allowed. Use PATCH." }, { status: 405 });
}
