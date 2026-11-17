import type { Booking, BookingStatus } from "@/lib/types";
import { getSupabaseServer } from "./server";
import { isNetworkError } from "./salons";

/**
 * Persistence for bookings.
 *
 * Every function degrades gracefully: with no Supabase keys the booking is
 * echoed back so the Mini App stays usable in demo mode, and the client keeps
 * it in localStorage. Once supabase/schema.sql is applied and .env.local holds
 * the keys, the same calls start writing to Postgres with no UI changes.
 *
 * Two rules hold across this module:
 *  1. Every read and every write is filtered by `salon_id`. A caller can only
 *     ever touch rows of the tenant it passes in, and that tenant is always
 *     resolved server-side (subdomain middleware, or a confirmed owner row) —
 *     never taken from a request body.
 *  2. An unreachable or degraded Supabase is reported as its own outcome,
 *     distinct from "the row does not exist" and from "the payload was
 *     refused". Callers map those onto 503 / 404 / 4xx, and never pass an
 *     internal error string back to the client.
 */

const TABLE = "bookings";

interface BookingRow {
  id: string;
  salon_id: string;
  master_id: string;
  service_ids: string[];
  booking_date: string;
  booking_time: string;
  duration_min: number;
  total_sum: number;
  status: BookingStatus;
  customer_name: string;
  customer_phone: string;
  telegram_user_id: number | null;
  created_at: string;
}

function toRow(booking: Booking): BookingRow {
  return {
    id: booking.id,
    salon_id: booking.salonId,
    master_id: booking.masterId,
    service_ids: booking.serviceIds,
    booking_date: booking.date,
    booking_time: booking.time,
    duration_min: booking.durationMin,
    total_sum: booking.totalSum,
    status: booking.status,
    customer_name: booking.customerName,
    customer_phone: booking.customerPhone,
    telegram_user_id: booking.telegramUserId ?? null,
    created_at: booking.createdAt,
  };
}

function fromRow(row: BookingRow): Booking {
  return {
    id: row.id,
    salonId: row.salon_id,
    masterId: row.master_id,
    serviceIds: row.service_ids,
    date: row.booking_date,
    time: row.booking_time,
    durationMin: row.duration_min,
    totalSum: row.total_sum,
    status: row.status,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    telegramUserId: row.telegram_user_id ?? undefined,
    createdAt: row.created_at,
  };
}

/* ------------------------------------------------------- failure triage --- */

/**
 * What a Supabase failure actually means for the caller.
 *
 *  - `transient`  the service could not answer authoritatively: network fault,
 *                 HTTP 5xx, connection/resource error, or a schema that is not
 *                 applied yet. Nothing can be concluded about the data. -> 503.
 *  - `conflict`   the service answered and refused the write because it would
 *                 break a uniqueness guarantee (e.g. the double-booking index
 *                 in supabase/schema.sql). -> 409.
 *  - `rejected`   the service answered and refused the payload on a constraint
 *                 (check / foreign key / not-null / bad literal). -> 4xx; a bug
 *                 or a probe, not an outage.
 *  - `none`       no failure.
 *
 * `isNetworkError` in ./salons only inspects real `Error` instances, which is
 * right for thrown values but misses `PostgrestError` — the plain object the
 * supabase-js client *returns* in `{ error }`. Both shapes are handled here, so
 * a returned 5xx is never mistaken for "no rows".
 */
export type DbFailureKind = "none" | "transient" | "conflict" | "rejected";

/** PostgreSQL class codes that mean "the service, not the payload". */
const TRANSIENT_CODE_PREFIXES = [
  "08", // connection exception
  "53", // insufficient resources
  "57", // operator intervention (admin shutdown, crash recovery)
  "58", // system error
];

const TRANSIENT_CODES = new Set([
  "40001", // serialization failure - retryable
  "40P01", // deadlock detected - retryable
  "42P01", // undefined table: supabase/schema.sql has not been applied
  "42703", // undefined column: schema drift
  "XX000", // internal error
  "PGRST000", // could not connect to the database
  "PGRST001", // could not connect (pool)
  "PGRST002", // schema cache could not be loaded
]);

export function classifyDbFailure(error: unknown): DbFailureKind {
  if (!error) return "none";

  // Thrown values: fetch failures, timeouts, aborts, 5xx with a cause chain.
  if (isNetworkError(error)) return "transient";

  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "").toLowerCase()
      : String(error).toLowerCase();

  if (code === "23505") return "conflict"; // unique_violation
  if (code === "23P01") return "conflict"; // exclusion_violation: overlapping booking
  if (code.startsWith("23")) return "rejected"; // check / fk / not-null
  if (code.startsWith("22")) return "rejected"; // bad literal, e.g. a non-uuid id
  // PGRST116: the result did not hold exactly one row. An authoritative answer
  // about the data, not an outage.
  if (code === "PGRST116") return "rejected";

  if (TRANSIENT_CODES.has(code)) return "transient";
  if (TRANSIENT_CODE_PREFIXES.some((prefix) => code.startsWith(prefix))) {
    return "transient";
  }
  if (/^5\d{2}$/.test(code)) return "transient"; // HTTP status surfaced as code

  // Message-level signatures, for clients that do not fill `code`.
  if (/^5\d{2}\b/.test(message)) return "transient";
  if (
    message.includes("fetch failed") ||
    message.includes("failed to fetch") ||
    message.includes("timeout") ||
    message.includes("econnrefused") ||
    message.includes("connection refused") ||
    message.includes("service unavailable") ||
    message.includes("does not exist") // missing relation, pre-migration
  ) {
    return "transient";
  }

  // Unplaceable: a PostgREST answer we do not recognise. Treated as transient
  // so an unknown infrastructure fault degrades (503, retryable) instead of
  // being reported to the caller as an authoritative "not found".
  return "transient";
}

/** True when nothing can be concluded about the data from this failure. */
export function isTransientDbFailure(error: unknown): boolean {
  return classifyDbFailure(error) === "transient";
}

/** Logs the real cause server-side; callers only ever send a generic message. */
function logDbFailure(where: string, error: unknown): void {
  let detail: string;
  if (error instanceof Error) {
    detail = error.message;
  } else if (typeof error === "object" && error !== null) {
    try {
      detail = JSON.stringify(error);
    } catch {
      detail = String(error);
    }
  } else {
    detail = String(error);
  }
  console.error(`[bookings.${where}] ${detail}`);
}

/* --------------------------------------------- tenant-scoped composition --- */

/**
 * Outcome of checking a requested master + services against one tenant's
 * catalogue, and pricing the booking from those same rows.
 *
 * This is what binds a public booking to the tenant resolved from the host: the
 * salon id is server-side, and the master and every service must belong to
 * *that* salon and be active. Without this check a caller on tenant A's
 * subdomain could book tenant B's master — the `master_id` foreign key in
 * supabase/schema.sql references `masters(id)` globally, not per salon — and
 * `duration_min` / `total_sum` would be priced from whatever catalogue the
 * process happened to hold rather than from the tenant's own rows.
 */
export type CompositionOutcome =
  | { ok: true; durationMin: number; totalSum: number }
  | { ok: false; reason: "unknown_master" | "unknown_service" | "master_cannot_serve" }
  | { ok: false; reason: "no_db" }
  | { ok: false; reason: "degraded" };

export async function resolveBookingComposition(
  salonId: string,
  masterId: string,
  serviceIds: string[],
): Promise<CompositionOutcome> {
  const db = getSupabaseServer();
  if (!db) return { ok: false, reason: "no_db" };

  const wanted = Array.from(new Set(serviceIds));
  if (wanted.length === 0) return { ok: false, reason: "unknown_service" };

  try {
    // 1. The master must exist, be active, and belong to this salon.
    const master = await db
      .from("masters")
      .select("id")
      .eq("id", masterId)
      .eq("salon_id", salonId)
      .eq("is_active", true)
      .maybeSingle<{ id: string }>();

    if (master.error) {
      logDbFailure("resolveBookingComposition.master", master.error);
      return classifyDbFailure(master.error) === "transient"
        ? { ok: false, reason: "degraded" }
        : { ok: false, reason: "unknown_master" };
    }
    if (!master.data) return { ok: false, reason: "unknown_master" };

    // 2. Every service must exist, be active, and belong to this salon. Price
    //    and duration are read here; the client never supplies them.
    const services = await db
      .from("services")
      .select("id, duration_min, price_sum")
      .eq("salon_id", salonId)
      .eq("is_active", true)
      .in("id", wanted)
      .returns<{ id: string; duration_min: number; price_sum: number }[]>();

    if (services.error) {
      logDbFailure("resolveBookingComposition.services", services.error);
      return classifyDbFailure(services.error) === "transient"
        ? { ok: false, reason: "degraded" }
        : { ok: false, reason: "unknown_service" };
    }

    const rows = services.data ?? [];
    if (rows.length !== wanted.length) return { ok: false, reason: "unknown_service" };

    // 3. The master must actually perform all of them (master_services).
    const links = await db
      .from("master_services")
      .select("service_id")
      .eq("master_id", masterId)
      .in("service_id", wanted)
      .returns<{ service_id: string }[]>();

    if (links.error) {
      logDbFailure("resolveBookingComposition.links", links.error);
      return classifyDbFailure(links.error) === "transient"
        ? { ok: false, reason: "degraded" }
        : { ok: false, reason: "master_cannot_serve" };
    }

    const served = new Set((links.data ?? []).map((row) => row.service_id));
    if (wanted.some((id) => !served.has(id))) {
      return { ok: false, reason: "master_cannot_serve" };
    }

    // Priced from the tenant's own rows, so both sums satisfy the schema checks
    // (`duration_min > 0`, `total_sum >= 0`) by construction.
    const durationMin = rows.reduce((total, row) => total + row.duration_min, 0);
    const totalSum = rows.reduce((total, row) => total + row.price_sum, 0);

    if (!Number.isFinite(durationMin) || durationMin <= 0) {
      return { ok: false, reason: "unknown_service" };
    }
    if (!Number.isFinite(totalSum) || totalSum < 0) {
      return { ok: false, reason: "unknown_service" };
    }

    return { ok: true, durationMin, totalSum };
  } catch (err) {
    logDbFailure("resolveBookingComposition", err);
    return { ok: false, reason: "degraded" };
  }
}

/* ----------------------------------------------------------- occupancy --- */

/**
 * Who is busy when, for one tenant on one day — and nothing else.
 *
 * This is public by design: a customer choosing a time has to see which slots
 * are gone. That is why it selects three columns and no more. Names, phones,
 * Telegram ids, prices and statuses never leave the table through this call.
 */
export interface BusyRow {
  masterId: string;
  time: string;
  durationMin: number;
}

export async function listBusy(
  salonId: string,
  isoDate: string,
): Promise<{ busy: BusyRow[]; degraded: boolean }> {
  const db = getSupabaseServer();
  if (!db) return { busy: [], degraded: true };

  try {
    const { data, error } = await db
      .from(TABLE)
      .select("master_id, booking_time, duration_min")
      .eq("salon_id", salonId)
      .eq("booking_date", isoDate)
      .neq("status", "cancelled")
      .limit(500)
      .returns<{ master_id: string; booking_time: string; duration_min: number }[]>();

    if (error) {
      logDbFailure("listBusy", error);
      return { busy: [], degraded: true };
    }

    return {
      busy: (data ?? []).map((row) => ({
        masterId: row.master_id,
        // Postgres `time` reads back as HH:MM:SS; the grid speaks HH:MM.
        time: row.booking_time.slice(0, 5),
        durationMin: row.duration_min,
      })),
      degraded: false,
    };
  } catch (err) {
    logDbFailure("listBusy", err);
    return { busy: [], degraded: true };
  }
}

/* --------------------------------------------------------------- create --- */

export interface PersistResult {
  booking: Booking;
  /** True when the row really landed in Postgres. */
  persisted: boolean;
  warning?: string;
  /**
   * Machine-readable discriminator for `persisted: false`, so callers do not
   * have to read English prose out of `warning` (see lib/save-state.ts).
   */
  reason?: "not_configured" | "degraded" | "conflict" | "rejected";
}

export async function createBooking(booking: Booking): Promise<PersistResult> {
  const db = getSupabaseServer();
  if (!db) {
    return {
      booking,
      persisted: false,
      reason: "not_configured",
      warning: "Supabase is not configured — booking was not stored server-side.",
    };
  }

  try {
    const { data, error } = await db
      .from(TABLE)
      .insert(toRow(booking))
      .select()
      .single<BookingRow>();

    if (error) {
      logDbFailure("createBooking", error);
      return { booking, ...persistFailure(classifyDbFailure(error)) };
    }
    return { booking: fromRow(data), persisted: true };
  } catch (err) {
    logDbFailure("createBooking", err);
    return { booking, ...persistFailure(classifyDbFailure(err)) };
  }
}

/**
 * Maps a failure kind onto the caller-safe part of `PersistResult`.
 *
 * The wording of `warning` matters: lib/save-state.ts still classifies by
 * phrase, and "unavailable" is what makes the UI say "the datastore could not
 * be reached" rather than "the salon refused this booking". New callers should
 * read `reason` instead.
 */
function persistFailure(kind: DbFailureKind): Omit<PersistResult, "booking"> {
  if (kind === "conflict") {
    // The double-booking unique index in supabase/schema.sql refused the slot.
    return {
      persisted: false,
      reason: "conflict",
      warning: "That slot has just been taken.",
    };
  }
  if (kind === "rejected") {
    // A constraint said no (check / foreign key). The message stays generic:
    // it must not echo database internals back to the caller.
    return {
      persisted: false,
      reason: "rejected",
      warning: "Booking was refused — the request did not pass validation.",
    };
  }
  return {
    persisted: false,
    reason: "degraded",
    warning: "Supabase temporarily unavailable",
  };
}

/* ----------------------------------------------------------------- read --- */

/**
 * Tenant-scoped listing for one customer.
 *
 * `degraded` is reported separately so no caller presents an unreachable
 * database as "you have no bookings".
 */
export interface ListBookingsResult {
  bookings: Booking[];
  degraded: boolean;
  /** Present when `degraded`; always a generic, caller-safe string. */
  warning?: string;
}

export async function listBookings(
  telegramUserId: number,
  salonId: string,
): Promise<ListBookingsResult> {
  const db = getSupabaseServer();
  if (!db) {
    return {
      bookings: [],
      degraded: true,
      warning: "Supabase is not configured — bookings could not be read.",
    };
  }

  try {
    const { data, error } = await db
      .from(TABLE)
      .select("*")
      // Both filters are mandatory: the customer *and* the tenant resolved
      // server-side. Without the salon filter this would list a customer's
      // bookings at other salons on the platform.
      .eq("telegram_user_id", telegramUserId)
      .eq("salon_id", salonId)
      .order("booking_date", { ascending: false })
      .order("booking_time", { ascending: false })
      .returns<BookingRow[]>();

    if (error) {
      logDbFailure("listBookings", error);
      return {
        bookings: [],
        degraded: true,
        warning: "Supabase temporarily unavailable",
      };
    }

    return { bookings: (data ?? []).map(fromRow), degraded: false };
  } catch (err) {
    logDbFailure("listBookings", err);
    return {
      bookings: [],
      degraded: true,
      warning: "Supabase temporarily unavailable",
    };
  }
}

/**
 * Reads one booking's current status, scoped to the tenant.
 *
 * `not_found_or_denied` deliberately covers both "no such booking" and "it
 * belongs to another salon": the caller cannot tell the two apart, so a guessed
 * booking id reveals nothing about another tenant.
 */
export type BookingStatusLookup =
  | { found: true; status: BookingStatus }
  | { found: false; reason: "not_found_or_denied" }
  | { found: false; reason: "degraded"; warning: string };

export async function getBookingStatusForSalon(
  id: string,
  salonId: string,
): Promise<BookingStatusLookup> {
  const db = getSupabaseServer();
  if (!db) {
    return {
      found: false,
      reason: "degraded",
      warning: "Supabase is not configured — booking could not be read.",
    };
  }

  try {
    const { data, error } = await db
      .from(TABLE)
      .select("status")
      .eq("id", id)
      .eq("salon_id", salonId)
      .maybeSingle<{ status: BookingStatus }>();

    if (error) {
      logDbFailure("getBookingStatusForSalon", error);
      // A payload the database refused (e.g. a malformed uuid) is an
      // authoritative "no such booking", not an outage.
      if (classifyDbFailure(error) !== "transient") {
        return { found: false, reason: "not_found_or_denied" };
      }
      return {
        found: false,
        reason: "degraded",
        warning: "Supabase temporarily unavailable",
      };
    }

    if (!data) return { found: false, reason: "not_found_or_denied" };
    return { found: true, status: data.status };
  } catch (err) {
    logDbFailure("getBookingStatusForSalon", err);
    return {
      found: false,
      reason: "degraded",
      warning: "Supabase temporarily unavailable",
    };
  }
}

/* --------------------------------------------------------------- update --- */

// Returns one of four outcomes so callers can distinguish "row not found or
// wrong tenant" from "the status moved under us" from "infrastructure fault".
export type StatusUpdateOutcome =
  | { updated: true; status: BookingStatus }
  | { updated: false; reason: "not_found_or_denied" }
  | { updated: false; reason: "stale_status" }
  | { updated: false; reason: "degraded"; warning: string };

export async function setBookingStatus(
  id: string,
  status: BookingStatus,
  salonId: string,
  /**
   * When given, the UPDATE only matches a row whose current status is one of
   * these. That makes the transition check atomic: a concurrent change cannot
   * slip in between a read and this write.
   */
  fromStatuses?: BookingStatus[],
): Promise<StatusUpdateOutcome> {
  const db = getSupabaseServer();
  if (!db) {
    return {
      updated: false,
      reason: "degraded",
      warning: "Supabase is not configured — status could not be changed.",
    };
  }

  try {
    // Tenant isolation: only update the booking when both the id and the
    // salon_id match. Without this, any caller that knows a booking uuid could
    // flip its status for any salon on the platform.
    let query = db
      .from(TABLE)
      .update({ status })
      .eq("id", id)
      .eq("salon_id", salonId);

    if (fromStatuses && fromStatuses.length > 0) {
      query = query.in("status", fromStatuses);
    }

    // `maybeSingle` so that "no row matched" comes back as a clean empty
    // answer rather than an error we would have to tell apart from a fault.
    const { error, data } = await query
      .select("status")
      .maybeSingle<{ status: BookingStatus }>();

    if (error) {
      logDbFailure("setBookingStatus", error);
      if (classifyDbFailure(error) !== "transient") {
        // The row was addressed but the write was refused (bad uuid literal,
        // or the status check constraint). Nothing leaks about other tenants.
        return { updated: false, reason: "not_found_or_denied" };
      }
      return {
        updated: false,
        reason: "degraded",
        warning: "Supabase temporarily unavailable",
      };
    }

    if (data) return { updated: true, status: data.status };

    // No row matched. With `fromStatuses` that can also mean the booking
    // exists but has moved on; the caller separates the two by reading first.
    return fromStatuses && fromStatuses.length > 0
      ? { updated: false, reason: "stale_status" }
      : { updated: false, reason: "not_found_or_denied" };
  } catch (err) {
    logDbFailure("setBookingStatus", err);
    return {
      updated: false,
      reason: "degraded",
      warning: "Supabase unavailable — status could not be changed.",
    };
  }
}

/* ------------------------------------------------- customer cancellation --- */

/**
 * The statuses a customer may cancel their own booking from.
 *
 * `paid` is deliberately absent: cancelling a paid appointment is a refund
 * decision, and refunds belong to the salon (and, once callbacks exist, to the
 * `payments` table). A customer asking to drop a paid booking is answered with
 * "the salon has to do this", not with a silent status flip that leaves money
 * recorded against a cancelled row.
 *
 * `cancelled` is not listed either, but it is not an error: cancelling an
 * already-cancelled booking is reported as success, so a retried tap is
 * idempotent.
 *
 * This is the customer-side subset of the transition table in
 * lib/domain/owner-auth.ts, and every value is one the `status` check
 * constraint in supabase/schema.sql already allows.
 */
export const CUSTOMER_CANCELLABLE_STATUSES: readonly BookingStatus[] = [
  "draft",
  "pending",
  "confirmed",
];

export type CustomerCancelOutcome =
  /** The row is now `cancelled`; `alreadyCancelled` when it already was. */
  | { cancelled: true; alreadyCancelled: boolean }
  /**
   * No booking matched the id *and* this customer *and* this salon. The three
   * cases — no such booking, someone else's booking, another salon's booking —
   * are one outcome on purpose: the caller cannot tell them apart.
   */
  | { cancelled: false; reason: "not_found_or_denied" }
  /**
   * The customer's own booking, in a status they may not cancel from —
   * either when it was read, or when a concurrent change moved it there.
   */
  | { cancelled: false; reason: "not_cancellable"; status: BookingStatus }
  /**
   * The status changed under the write, to another status a customer may
   * still cancel from. A retry will go through. A concurrent change *to*
   * `cancelled` is not this outcome: that is reported as success.
   */
  | { cancelled: false; reason: "stale_status" }
  /** Supabase could not answer; nothing can be concluded about the row. */
  | { cancelled: false; reason: "degraded" };

/**
 * Cancels one booking on behalf of the customer who made it.
 *
 * Ownership is expressed entirely in SQL, and every filter is applied on both
 * statements: the booking id, the Telegram user id (verified from signed
 * `initData`, never claimed in a payload) and the salon id (resolved by the
 * subdomain middleware). A booking with a NULL `telegram_user_id` — one taken
 * in demo mode, before identity verification was switched on — matches no
 * customer and therefore cannot be cancelled through this path.
 *
 * The write is a conditional UPDATE pinned to the status that was just
 * checked, so a concurrent change (the salon confirming or taking payment)
 * cannot slip in between the two statements: the UPDATE simply matches no row.
 *
 * When that happens the row is re-read once, by the three ownership columns
 * alone, to tell the four possible races apart: it is already `cancelled`
 * (idempotent success), it became uncancellable (`not_cancellable`), it moved
 * to another cancellable status (`stale_status`, worth retrying), or it is
 * gone (hidden as not-found). The re-read never writes, so the single
 * conditional UPDATE remains the only way a row is cancelled.
 */
export async function cancelOwnBooking(
  id: string,
  telegramUserId: number,
  salonId: string,
): Promise<CustomerCancelOutcome> {
  const db = getSupabaseServer();
  if (!db) return { cancelled: false, reason: "degraded" };

  try {
    // 1. One lookup, filtered by all three ownership columns at once. There is
    //    no intermediate state in which the row is addressed by id alone.
    const found = await db
      .from(TABLE)
      .select("status")
      .eq("id", id)
      .eq("telegram_user_id", telegramUserId)
      .eq("salon_id", salonId)
      .maybeSingle<{ status: BookingStatus }>();

    if (found.error) {
      logDbFailure("cancelOwnBooking.read", found.error);
      // A refused payload (a malformed uuid, say) is an authoritative "no such
      // booking of yours", not an outage.
      return classifyDbFailure(found.error) === "transient"
        ? { cancelled: false, reason: "degraded" }
        : { cancelled: false, reason: "not_found_or_denied" };
    }

    if (!found.data) return { cancelled: false, reason: "not_found_or_denied" };

    const current = found.data.status;
    if (current === "cancelled") {
      return { cancelled: true, alreadyCancelled: true };
    }
    if (!CUSTOMER_CANCELLABLE_STATUSES.includes(current)) {
      return { cancelled: false, reason: "not_cancellable", status: current };
    }

    // 2. Atomic write: the same three ownership filters, plus the status the
    //    decision above was made on.
    const updated = await db
      .from(TABLE)
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("telegram_user_id", telegramUserId)
      .eq("salon_id", salonId)
      .eq("status", current)
      .select("status")
      .maybeSingle<{ status: BookingStatus }>();

    if (updated.error) {
      logDbFailure("cancelOwnBooking.update", updated.error);
      return classifyDbFailure(updated.error) === "transient"
        ? { cancelled: false, reason: "degraded" }
        : { cancelled: false, reason: "not_found_or_denied" };
    }

    if (!updated.data) {
      // 3. The conditional UPDATE matched nothing, although the row was there
      //    and was theirs a moment ago: its status moved between the two
      //    statements. Re-read it — by the same three ownership columns only,
      //    never by status — to report what actually happened instead of
      //    calling every race a conflict.
      //
      //    This read is purely diagnostic. Nothing is written on the strength
      //    of it: the only write in this function is still the conditional
      //    UPDATE above, so no outcome here can be a cancellation that the
      //    status check did not allow. Re-trying the UPDATE from the new
      //    status is deliberately *not* done — a customer who asked to cancel
      //    a `pending` booking has not agreed to cancel one the salon has
      //    since confirmed.
      const after = await db
        .from(TABLE)
        .select("status")
        .eq("id", id)
        .eq("telegram_user_id", telegramUserId)
        .eq("salon_id", salonId)
        .maybeSingle<{ status: BookingStatus }>();

      if (after.error) {
        logDbFailure("cancelOwnBooking.reread", after.error);
        // The row existed and was theirs moments ago, so nothing here may
        // claim it is gone, and nothing may claim it was cancelled — it was
        // not. A degraded service says so; anything else is reported as a
        // race the caller can retry.
        return classifyDbFailure(after.error) === "transient"
          ? { cancelled: false, reason: "degraded" }
          : { cancelled: false, reason: "stale_status" };
      }

      // Gone in the meantime. With the same three filters in place this is
      // also the answer for a row that was never ours, so it stays hidden as
      // a plain not-found, exactly as a foreign booking is.
      if (!after.data) return { cancelled: false, reason: "not_found_or_denied" };

      const latest = after.data.status;

      // Someone else cancelled it first — a second tab, a retried request, or
      // the salon. The customer's intent is satisfied, so this is the
      // idempotent success rather than a conflict.
      if (latest === "cancelled") return { cancelled: true, alreadyCancelled: true };

      // It moved to a status a customer may not cancel from (`paid`, with the
      // statuses supabase/schema.sql allows today). Reported with that status
      // so the caller can say "the salon has to do this", not "try again".
      if (!CUSTOMER_CANCELLABLE_STATUSES.includes(latest)) {
        return { cancelled: false, reason: "not_cancellable", status: latest };
      }

      // Still cancellable, just not from the status that was checked
      // (`pending` -> `confirmed`, say). A retry will go through, so this is
      // the one case that is a genuine conflict.
      return { cancelled: false, reason: "stale_status" };
    }

    return { cancelled: true, alreadyCancelled: false };
  } catch (err) {
    logDbFailure("cancelOwnBooking", err);
    return { cancelled: false, reason: "degraded" };
  }
}
