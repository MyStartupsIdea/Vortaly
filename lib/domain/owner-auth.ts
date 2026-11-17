import { NextResponse } from "next/server";
import { readOwnerSession } from "@/lib/owner/session";
import { ownedSlugs } from "@/lib/owner/store";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { BookingStatus } from "@/lib/types";
import {
  classifyDbFailure,
  getBookingStatusForSalon,
  isTransientDbFailure,
  setBookingStatus,
} from "@/lib/supabase/bookings";

// ---------------------------------------------------------------------------
// ownerAuth
// ---------------------------------------------------------------------------

export type OwnerAuthFailureReason =
  /** No credential was presented, or the token is invalid/expired. -> 401 */
  | "no_session"
  /** Valid session, but the user is not linked to any salon. -> 403 */
  | "no_owner_row"
  /** Valid session, but not linked to the salon being addressed. -> 403 */
  | "not_linked_to_salon"
  /** The user owns several salons and the request named none. -> 400 */
  | "ambiguous_salon"
  /** Supabase (auth or data API) could not answer. -> 503 */
  | "auth_unavailable";

export type OwnerAuth =
  | { ok: true; uid: string; salonId: string; role: "owner" | "manager" }
  | { ok: false; reason: OwnerAuthFailureReason };

const COOKIE_NAME = "auth.token";

/**
 * Reads the session JWT from the request.
 *
 * Accepted sources, in order of preference:
 *  1. `Authorization: Bearer <jwt>` — the intended path for a client that
 *     obtains a session from the Supabase client on a separate auth surface.
 *  2. A cookie named `auth.token` — the simpler path when you do not want to
 *     pass the JWT explicitly. The name avoids colliding with any existing
 *     platform cookie; if you later adopt Supabase's own cookie names, change
 *     it here.
 *
 * The cookie header is parsed by splitting on `;` and matching the name
 * exactly. An earlier version used a single regular expression whose `^`
 * branch could match at offset zero and capture whatever cookie happened to
 * come first, so `sid=abc; auth.token=<jwt>` yielded `sid=abc` as the "token".
 */
function readSessionToken(request: Request): string | undefined {
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (match) {
      const token = match[1].trim();
      if (token) return token;
    }
  }

  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const name = part.slice(0, separator).trim();
    if (name !== COOKIE_NAME) continue;

    const raw = part.slice(separator + 1).trim();
    if (!raw) return undefined;
    try {
      return decodeURIComponent(raw);
    } catch {
      // A malformed percent-escape is not a reason to drop the credential;
      // the token itself is validated by Supabase either way.
      return raw;
    }
  }

  return undefined;
}

/**
 * True when a Supabase auth failure means "the service could not answer",
 * as opposed to "this token is not valid".
 *
 * The distinction is the whole point: a degraded auth service must not be
 * reported to an owner as a bad login, and a bad login must not be reported
 * as an outage.
 */
function isAuthServiceFailure(error: unknown): boolean {
  if (!error) return false;

  const name = typeof error === "object" && error !== null && "name" in error
    ? String((error as { name?: unknown }).name ?? "")
    : "";
  // supabase-js surfaces network-level auth faults as AuthRetryableFetchError.
  if (name.includes("Retryable")) return true;

  // The HTTP status is consulted before anything else, because it is the one
  // authoritative signal here. `classifyDbFailure` below is tuned for
  // PostgREST and treats anything it cannot place as transient — correct for a
  // data query, wrong for auth, where "4xx: this token is not valid" is a
  // perfectly clear answer that must stay a 401.
  const status = typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: unknown }).status
    : undefined;
  if (typeof status === "number" && status !== 0) {
    // 5xx: the auth service is down. 429: it refused to answer right now.
    if (status >= 500 || status === 429) return true;
    if (status >= 400) return false; // authoritative refusal of the token
  }

  // No usable status: a fetch-level fault, or no HTTP exchange at all. Nothing
  // was learned about the token, so the request degrades instead of telling an
  // owner their login is bad.
  return true;
}

/**
 * Read an owner's session and resolve the salon they may act on.
 *
 * Two kinds of session are accepted:
 *  - the Telegram owner session (lib/owner/session.ts), the one owners get
 *    from /owner; its businesses come from `owner_links`;
 *  - a Supabase Auth JWT linked through `salon_owners`, as before.
 * A Telegram session is checked first. Either way the tenant comes from the
 * stored link, never from the request.
 *
 * This helper does not create sessions, sign users in, or send emails. Session
 * issuance belongs in a separate auth surface (email/phone magic link, OAuth,
 * etc.) and is intentionally out of scope for this backend stage.
 *
 * @param requiredSalonId when given, the session must be linked to exactly
 *   this salon; otherwise the call fails with `not_linked_to_salon`. The value
 *   is never used as the tenant — the tenant always comes from the owner row
 *   that Postgres returns.
 */
export async function ownerAuth(
  request: Request,
  requiredSalonId?: string,
): Promise<OwnerAuth> {
  const telegramOwner = readOwnerSession(request);
  if (telegramOwner) {
    const slugs = await ownedSlugs(telegramOwner.telegramId);
    if (slugs === null) return { ok: false, reason: "auth_unavailable" };
    if (slugs.length > 0) {
      const uid = `telegram:${telegramOwner.telegramId}`;
      const wanted = requiredSalonId?.trim();
      if (wanted) {
        return slugs.includes(wanted)
          ? { ok: true, uid, salonId: wanted, role: "owner" }
          : { ok: false, reason: "not_linked_to_salon" };
      }
      if (slugs.length > 1) return { ok: false, reason: "ambiguous_salon" };
      return { ok: true, uid, salonId: slugs[0], role: "owner" };
    }
    // Signed in with Telegram but linked to nothing: fall through, in case the
    // request also carries a Supabase session.
  }

  const db = getSupabaseServer();
  if (!db) {
    // No Supabase keys in the environment. That is a deployment fault, not a
    // statement about the caller's session, so it must not read as 401.
    return { ok: false, reason: "auth_unavailable" };
  }

  const token = readSessionToken(request);
  if (!token) {
    return { ok: false, reason: "no_session" };
  }

  let uid: string;
  try {
    // getUser() validates the JWT against the auth service and returns the
    // user. An invalid or expired token comes back as `error`, not a throw.
    const { data, error } = await db.auth.getUser(token);

    if (error) {
      console.warn("[ownerAuth] getUser failed:", error.message);
      return isAuthServiceFailure(error)
        ? { ok: false, reason: "auth_unavailable" }
        : { ok: false, reason: "no_session" };
    }

    const user = data?.user ?? null;
    if (!user?.id) {
      return { ok: false, reason: "no_session" };
    }
    uid = user.id;
  } catch (err) {
    console.error(
      "[ownerAuth] getUser threw:",
      err instanceof Error ? err.message : String(err),
    );
    return isAuthServiceFailure(err)
      ? { ok: false, reason: "auth_unavailable" }
      : { ok: false, reason: "no_session" };
  }

  // Which salons is this uid linked to? `salon_owners` is unique on
  // (uid, salon_id), so an operator may legitimately link one person to more
  // than one salon. All rows are read and the caller's scope is picked from
  // them; a single-row owner behaves exactly as before.
  let rows: { salon_id: string; role: string }[];
  try {
    const { data, error } = await db
      .from("salon_owners")
      .select("salon_id, role")
      .eq("uid", uid)
      .returns<{ salon_id: string; role: string }[]>();

    if (error) {
      console.error("[ownerAuth] salon_owners lookup failed:", error.message);
      // A missing table (schema not applied) or a 5xx is an outage, not a
      // verdict that this user has no salon.
      return classifyDbFailure(error) === "transient"
        ? { ok: false, reason: "auth_unavailable" }
        : { ok: false, reason: "no_owner_row" };
    }

    rows = data ?? [];
  } catch (err) {
    console.error(
      "[ownerAuth] salon_owners lookup threw:",
      err instanceof Error ? err.message : String(err),
    );
    return isTransientDbFailure(err)
      ? { ok: false, reason: "auth_unavailable" }
      : { ok: false, reason: "no_owner_row" };
  }

  if (rows.length === 0) {
    // Authenticated, but not an owner or manager of any salon. Invite-only:
    // only the platform operator creates these rows.
    return { ok: false, reason: "no_owner_row" };
  }

  const wanted = requiredSalonId?.trim();
  if (wanted) {
    const match = rows.find((row) => row.salon_id === wanted);
    if (!match) {
      // Authenticated, but this salon is not theirs. The response says only
      // that access is denied; it never confirms the salon exists.
      return { ok: false, reason: "not_linked_to_salon" };
    }
    return { ok: true, uid, salonId: match.salon_id, role: asRole(match.role) };
  }

  if (rows.length > 1) {
    // Several salons and nothing to choose between them. Picking one silently
    // would show an owner the wrong salon's bookings, so the caller is asked
    // to name it instead.
    return { ok: false, reason: "ambiguous_salon" };
  }

  return { ok: true, uid, salonId: rows[0].salon_id, role: asRole(rows[0].role) };
}

function asRole(role: string): "owner" | "manager" {
  return role === "owner" ? "owner" : "manager";
}

// ---------------------------------------------------------------------------
// error helpers
// ---------------------------------------------------------------------------
//
// Every response body here is a fixed string. No database message, no stack,
// no internal identifier reaches the client; the detail is logged server-side.

export function ownerServiceUnavailable(_request?: Request, _message?: string): NextResponse {
  return NextResponse.json(
    {
      error: "service_unavailable",
      message: "The booking service is temporarily unavailable. Please try again.",
    },
    { status: 503 },
  );
}

export function ownerAuthRequired(_headers?: Headers): NextResponse {
  return NextResponse.json(
    {
      error: "unauthorized",
      message: "Login is required to access this salon.",
    },
    { status: 401 },
  );
}

export function ownerTenantDenied(_headers?: Headers): NextResponse {
  return NextResponse.json(
    {
      error: "forbidden",
      message: "This account does not have access to the requested salon.",
    },
    { status: 403 },
  );
}

export function ownerSalonAmbiguous(_headers?: Headers): NextResponse {
  return NextResponse.json(
    {
      error: "salon_required",
      message:
        "This account is linked to several salons. Pass ?salonId=<id> to choose one.",
    },
    { status: 400 },
  );
}

export function bookingNotFound(_headers?: Headers): NextResponse {
  return NextResponse.json(
    {
      error: "not_found",
      message: "The booking was not found or does not belong to this salon.",
    },
    { status: 404 },
  );
}

/**
 * Single place that turns an `ownerAuth` failure into a response.
 *
 * The mapping is the one documented in lib/notes/owner-auth-roadmap.md:
 *   401 no valid session · 403 authenticated but not entitled ·
 *   400 entitled to several salons and none was named · 503 Supabase degraded.
 */
function ownerAuthFailure(request: Request, reason: OwnerAuthFailureReason): NextResponse {
  switch (reason) {
    case "no_session":
      return ownerAuthRequired(request.headers);
    case "no_owner_row":
    case "not_linked_to_salon":
      return ownerTenantDenied(request.headers);
    case "ambiguous_salon":
      return ownerSalonAmbiguous(request.headers);
    case "auth_unavailable":
      return ownerServiceUnavailable(request);
  }
}

// ---------------------------------------------------------------------------
// booking status transitions
// ---------------------------------------------------------------------------

/**
 * Which statuses an owner may move a booking to.
 *
 * The five states are exactly the ones the `status` check constraint in
 * supabase/schema.sql allows, so nothing here can produce a value Postgres
 * would refuse. The transitions add the ordering the schema cannot express:
 *
 *   draft     -> pending, cancelled
 *   pending   -> confirmed, paid, cancelled
 *   confirmed -> paid, cancelled
 *   paid      -> cancelled          (refund / no-show; money stays recorded
 *                                    in `payments`)
 *   cancelled -> (terminal)
 *
 * `paid` is reachable from `pending`/`confirmed` because a salon takes cash at
 * the chair; a provider callback is the other writer of that state. Nothing
 * may go back to `draft`, and a `paid` booking can never be walked back to
 * `pending` or `confirmed` — that would silently un-record a payment.
 *
 * Setting the status a booking already has is accepted as a no-op, so a
 * retried request is idempotent rather than a conflict.
 */
export const BOOKING_STATUSES: readonly BookingStatus[] = [
  "draft",
  "pending",
  "confirmed",
  "paid",
  "cancelled",
];

const ALLOWED_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  draft: ["pending", "cancelled"],
  pending: ["confirmed", "paid", "cancelled"],
  confirmed: ["paid", "cancelled"],
  paid: ["cancelled"],
  cancelled: [],
};

export function isBookingStatus(value: unknown): value is BookingStatus {
  return typeof value === "string" && (BOOKING_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  if (from === to) return true; // idempotent no-op
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function allowedNextStatuses(from: BookingStatus): readonly BookingStatus[] {
  return ALLOWED_TRANSITIONS[from];
}

// ---------------------------------------------------------------------------
// owner booking endpoints
// ---------------------------------------------------------------------------

export interface OwnerBookingStatusPayload {
  status?: unknown;
  note?: unknown;
}

export interface OwnerScopeOptions {
  /**
   * A salon the session must be linked to, from a trusted server-side source
   * (e.g. the tenant the subdomain middleware resolved). It restricts access;
   * it can never widen it.
   */
  requiredSalonId?: string;
}

/**
 * The salon the request is asking about, if it named one.
 *
 * This is a *filter*, not an authorisation input: `ownerAuth` only ever grants
 * the salon that `salon_owners` returns for the session, so naming another
 * salon here can only produce 403.
 */
function requestedSalonId(request: Request, options?: OwnerScopeOptions): string | undefined {
  if (options?.requiredSalonId?.trim()) return options.requiredSalonId.trim();
  try {
    const fromQuery = new URL(request.url).searchParams.get("salonId");
    return fromQuery?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function ownerListBookings(
  request: Request,
  options?: OwnerScopeOptions,
): Promise<NextResponse> {
  const auth = await ownerAuth(request, requestedSalonId(request, options));
  if (!auth.ok) {
    return ownerAuthFailure(request, auth.reason);
  }

  const db = getSupabaseServer();
  if (!db) {
    return ownerServiceUnavailable(request);
  }

  try {
    const { data, error } = await db
      .from("bookings")
      .select(
        "id, booking_date, booking_time, status, total_sum, customer_name, customer_phone, created_at, service_ids, master_id, duration_min",
      )
      // The tenant comes from the confirmed owner row, never from the request.
      .eq("salon_id", auth.salonId)
      .order("booking_date", { ascending: false })
      .order("booking_time", { ascending: false });

    if (error) {
      console.error("[ownerListBookings] query failed:", error.message);
      // Any error here is a service fault, including a schema that has not
      // been applied. An empty 200 would read as "this salon has no
      // bookings", which is a claim we cannot make.
      return ownerServiceUnavailable(request);
    }

    return NextResponse.json(
      { salonId: auth.salonId, bookings: data ?? [] },
      { status: 200 },
    );
  } catch (err) {
    console.error(
      "[ownerListBookings] query threw:",
      err instanceof Error ? err.message : String(err),
    );
    return ownerServiceUnavailable(request);
  }
}

export async function ownerSetBookingStatus(
  request: Request,
  context: { params: Promise<{ id?: string }> },
  options?: OwnerScopeOptions,
): Promise<NextResponse> {
  const auth = await ownerAuth(request, requestedSalonId(request, options));
  if (!auth.ok) {
    return ownerAuthFailure(request, auth.reason);
  }

  const resolvedParams = await context.params;
  const id = resolvedParams?.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  let body: OwnerBookingStatusPayload;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
    }
    body = parsed as OwnerBookingStatusPayload;
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  if (!isBookingStatus(body.status)) {
    return NextResponse.json(
      { error: "Invalid status value", allowed: BOOKING_STATUSES },
      { status: 400 },
    );
  }
  const target: BookingStatus = body.status;

  // Read the current status first, scoped to the owner's salon. This is what
  // makes a foreign booking indistinguishable from a missing one: the lookup
  // filters on salon_id, so another tenant's booking simply is not there, and
  // the transition check below never runs on a row we may not see.
  const current = await getBookingStatusForSalon(id, auth.salonId);

  if (!current.found) {
    if (current.reason === "degraded") {
      return ownerServiceUnavailable(request);
    }
    return bookingNotFound(request.headers);
  }

  if (current.status === target) {
    // Idempotent: nothing to write.
    return NextResponse.json(
      { updated: true, unchanged: true, id, status: target },
      { status: 200 },
    );
  }

  if (!canTransition(current.status, target)) {
    return NextResponse.json(
      {
        error: "invalid_transition",
        message: `A booking cannot go from ${current.status} to ${target}.`,
        from: current.status,
        allowed: allowedNextStatuses(current.status),
      },
      { status: 409 },
    );
  }

  // Atomic: the UPDATE matches only while the row still holds the status we
  // validated against, so a concurrent change cannot slip in between.
  let outcome;
  try {
    outcome = await setBookingStatus(id, target, auth.salonId, [current.status]);
  } catch (err) {
    console.error(
      "[ownerSetBookingStatus] update threw:",
      err instanceof Error ? err.message : String(err),
    );
    return ownerServiceUnavailable(request);
  }

  if (outcome.updated) {
    return NextResponse.json({ updated: true, id, status: outcome.status }, { status: 200 });
  }

  if (outcome.reason === "degraded") {
    return ownerServiceUnavailable(request);
  }

  if (outcome.reason === "stale_status") {
    return NextResponse.json(
      {
        error: "conflict",
        message: "The booking status changed while this request was in flight.",
      },
      { status: 409 },
    );
  }

  // not_found_or_denied: the booking does not exist, or it belongs to another
  // salon. The two are deliberately indistinguishable to the caller.
  return bookingNotFound(request.headers);
}
