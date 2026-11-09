import { ownerSetBookingStatus } from "@/lib/domain/owner-auth";

/**
 * PATCH /api/owner/bookings/<id>/status
 *
 * Body: `{ "status": "draft" | "pending" | "confirmed" | "paid" | "cancelled" }`
 *
 * The booking must belong to the salon the authenticated owner is linked to.
 * A booking of another salon answers 404, exactly as a non-existent one does,
 * so a guessed uuid reveals nothing about another tenant.
 *
 * 200 updated (idempotent when the status is unchanged) · 400 bad payload ·
 * 401 no session · 403 not entitled · 404 unknown booking ·
 * 409 transition not allowed, or the row changed in flight · 503 degraded.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return ownerSetBookingStatus(request, context);
}
