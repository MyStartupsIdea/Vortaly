import { NextResponse } from "next/server";
import { cancelOwnBooking } from "@/lib/supabase/bookings";
import { type InitDataFailure, requireTelegramUser } from "@/lib/telegram/init-data";
import { resolvedSalonId, tenantNotResolved } from "./tenant-context";

/**
 * Customer-side booking actions, for the person who made the booking.
 *
 * The counterpart of lib/domain/owner-auth.ts: that module serves the salon
 * (Supabase session, scoped to the salon it owns), this one serves the
 * customer (verified Telegram `initData`, scoped to their own bookings at the
 * tenant they are visiting). Neither identity can be used in place of the
 * other, and neither path ever takes a tenant or a user id from a payload.
 *
 * Every response body here is a fixed shape with a stable `error` code. No
 * Supabase message, PostgREST code, stack or row content reaches the client;
 * the detail is logged server-side by lib/supabase/bookings.ts.
 */

/* -------------------------------------------------------------- answers --- */

/**
 * Turns a failed `initData` check into a response.
 *
 * `not_configured` is the server's own fault and retryable, so it is a 503.
 * Everything else is a 401 with a code the Mini App can act on: `expired`
 * means "reopen the app to get fresh initData", the rest mean "this request
 * carried no usable proof of who is calling". `invalid` deliberately covers
 * both a malformed payload and a bad signature — telling them apart would
 * only help someone probing the check.
 */
export function identityFailure(reason: InitDataFailure): NextResponse {
  if (reason === "not_configured") {
    return NextResponse.json(
      {
        error: "identity_verification_unavailable",
        message: "The server cannot verify Telegram sessions right now.",
      },
      { status: 503 },
    );
  }

  const message =
    reason === "expired"
      ? "This Telegram session has expired. Reopen the Mini App and try again."
      : "Open this page from the salon's Telegram Mini App to continue.";

  return NextResponse.json(
    { error: "telegram_identity_required", reason, message },
    { status: 401 },
  );
}

/** Stable 503 for every degraded-datastore case on the public booking API. */
export function bookingServiceUnavailable(): NextResponse {
  return NextResponse.json(
    { error: "Booking service temporarily unavailable" },
    { status: 503 },
  );
}

/**
 * The one answer for "that booking is not yours".
 *
 * Returned identically whether the booking does not exist, belongs to another
 * customer, or belongs to another salon. Keeping the three indistinguishable is
 * the point: a booking id is a uuid that travels in links and screenshots, and
 * a caller who holds one must not be able to learn whose it is or that it
 * exists at all.
 */
function bookingNotFound(): NextResponse {
  return NextResponse.json(
    {
      error: "not_found",
      message: "No such booking was found for you at this salon.",
    },
    { status: 404 },
  );
}

/* ------------------------------------------------------------ cancelling --- */

/**
 * `POST /api/bookings/<id>/cancel` — a customer cancels their own booking.
 *
 * Order of checks, cheapest and most general first:
 *  1. the tenant must be resolved server-side (403 otherwise);
 *  2. the caller must present valid `initData` (401, or 503 when the server
 *     holds no bot token and cannot verify anyone);
 *  3. the booking must exist for *that* customer at *that* salon (404);
 *  4. its status must be one a customer may cancel from (409).
 *
 * Idempotent in both directions: a repeat tap, and two requests racing each
 * other, both end in 200 with `unchanged: true` once the booking is
 * cancelled. 409 is reserved for the two cases where it is not — the status
 * moved somewhere a customer may not cancel from (`not_cancellable`, with the
 * status named), or it moved to another cancellable status and the request is
 * worth repeating (`conflict`).
 *
 * The request body is not read: the route is the action, the id is in the
 * path, and the actor comes from the verified session. There is nothing a
 * payload could add that would not be an opportunity to claim something.
 */
export async function customerCancelBooking(
  request: Request,
  context: { params: Promise<{ id?: string }> },
): Promise<NextResponse> {
  const salonId = resolvedSalonId(request);
  if (!salonId) {
    return tenantNotResolved("Cancel a booking from the salon's Telegram Mini App.");
  }

  const identity = requireTelegramUser(request);
  if (!identity.ok) return identityFailure(identity.reason);

  const params = await context.params;
  const id = params?.id?.trim();
  if (!id) {
    return NextResponse.json(
      { error: "invalid_request", message: "A booking id is required." },
      { status: 400 },
    );
  }

  const outcome = await cancelOwnBooking(id, identity.userId, salonId);

  if (outcome.cancelled) {
    // Idempotent: an already-cancelled booking is a success, not a conflict —
    // whether it was cancelled long ago or by a request racing this one.
    // `unchanged` says whether this call is what cancelled it.
    return NextResponse.json(
      {
        ok: true,
        id,
        status: "cancelled",
        unchanged: outcome.alreadyCancelled,
      },
      { status: 200 },
    );
  }

  if (outcome.reason === "degraded") {
    return bookingServiceUnavailable();
  }

  if (outcome.reason === "not_cancellable") {
    // Only reachable for the caller's own booking, so naming the current
    // status reveals nothing they do not already hold — and it is what tells
    // them to ring the salon instead of tapping again. Reached both when the
    // booking was already `paid` and when it became `paid` mid-request.
    return NextResponse.json(
      {
        error: "not_cancellable",
        status: outcome.status,
        message:
          "This booking can no longer be cancelled here. Please contact the salon.",
      },
      { status: 409 },
    );
  }

  if (outcome.reason === "stale_status") {
    // The booking is still cancellable, just not from the status this request
    // checked — so "try again" is literal advice here, not a shrug.
    return NextResponse.json(
      {
        error: "conflict",
        message: "The booking changed while this request was in flight. Try again.",
      },
      { status: 409 },
    );
  }

  return bookingNotFound();
}
