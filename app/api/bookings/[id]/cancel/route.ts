import { NextResponse } from "next/server";
import { customerCancelBooking } from "@/lib/domain/customer-bookings";

/**
 * POST /api/bookings/<id>/cancel
 *
 * The customer-facing cancellation. The caller proves who they are with signed
 * Telegram `initData` (`X-Telegram-Init-Data`, or `Authorization: tma …`), the
 * salon comes from the subdomain middleware, and the booking is looked up by
 * id, that verified Telegram user and that salon together — so this endpoint
 * can only ever reach the caller's own booking at the salon they are visiting.
 *
 * Responses: 200 cancelled (or already cancelled) · 400 no id ·
 * 401 identity missing/invalid/expired · 403 tenant not resolved ·
 * 404 no such booking of yours · 409 status may not be cancelled here, or it
 * changed in flight · 503 verification unconfigured or Supabase degraded.
 *
 * Separate from `[id]/status` on purpose: that route is the salon's lever and
 * takes any status, this one is the customer's and does exactly one thing.
 *
 * POST rather than PATCH because this is a command, not a field edit. It is
 * still idempotent — cancelling twice answers 200 with `unchanged: true`.
 */

// Verifying initData needs node:crypto, so this handler runs on Node.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return customerCancelBooking(request, context);
}

// Cancelling is a mutation; it must never be reachable with a read verb that a
// link preview or a crawler could follow.
export async function GET() {
  return NextResponse.json({ error: "Method not allowed. Use POST." }, { status: 405 });
}
