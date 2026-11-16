import { NextResponse } from "next/server";
import { TENANT_SUFFIX } from "@/lib/domain/config";
import {
  getMaster,
  getService,
  salon as demoSalon,
  totalFor,
} from "@/lib/data/salon";
import {
  bookingServiceUnavailable,
  identityFailure,
} from "@/lib/domain/customer-bookings";
import { resolvedSalonId, tenantNotResolved } from "@/lib/domain/tenant-context";
import {
  createBooking,
  listBookings,
  resolveBookingComposition,
  type CompositionOutcome,
} from "@/lib/supabase/bookings";
import { loadSite } from "@/lib/builder/store";
import type { SiteSpec } from "@/lib/builder/spec";
import { optionalTelegramUser, requireTelegramUser } from "@/lib/telegram/init-data";
import type { Booking } from "@/lib/types";

/**
 * Public booking API for the Telegram Mini App.
 *
 * Tenant model
 * ------------
 * The tenant is resolved server-side by the subdomain proxy
 * (proxy.ts) from *.<ROOT_DOMAIN> and forwarded on `x-salon-id`. The
 * proxy deletes any client-supplied copy of that header before setting its
 * own, so this handler can only ever see a host-derived salon id.
 *
 * Nothing about the tenant is read from the request body. There is deliberately
 * no `salonId` field in `CreateBody`: a client cannot name the salon it is
 * writing to, and an unexpected `salonId` / `salon_id` / `status` / `id` key in
 * the payload is ignored rather than honoured.
 *
 * Beyond the salon id, the *contents* of the booking are also bound to the
 * tenant: the master and every service are looked up under the resolved
 * `salon_id`, and the price and duration come from those rows. Without that,
 * tenant A's subdomain could book tenant B's master (the `master_id` foreign
 * key in supabase/schema.sql references `masters(id)` globally) and the booking
 * would be priced from the static demo catalogue.
 *
 * Customer identity
 * -----------------
 * The customer is identified by verified Telegram `initData`
 * (`lib/telegram/init-data.ts`), passed as `X-Telegram-Init-Data` or
 * `Authorization: tma …`. A `telegramUserId` in the request body is ignored:
 * it used to be written straight into `telegram_user_id`, which let any caller
 * file a booking under someone else's Telegram id — and, through GET below,
 * read that person's bookings back out.
 *
 * Who may do what:
 *  - POST needs a verified caller whenever a bot token is configured. With no
 *    token (local demo), the booking is stored with no `telegram_user_id`
 *    rather than with an unverified one.
 *  - GET always needs a verified caller, and returns only rows matching that
 *    user *and* the resolved tenant. Both filters are applied in SQL.
 *
 * The identity is per Telegram user, not per salon: the same person booking at
 * two salons sees each salon's bookings only on that salon's subdomain.
 */

// node:crypto is used to verify initData, so this handler needs the Node
// runtime rather than the edge runtime.
export const runtime = "nodejs";

interface CreateBody {
  masterId?: unknown;
  serviceIds?: unknown;
  date?: unknown;
  time?: unknown;
  customerName?: unknown;
  customerPhone?: unknown;
  // No `telegramUserId` field, and no `salonId`: both are resolved
  // server-side. An extra key of either name in the payload is ignored.
}

/** Caps that keep an unbounded payload out of unbounded `text` columns. */
const MAX_SERVICES_PER_BOOKING = 20;
const MAX_ID_LENGTH = 64;
const MAX_NAME_LENGTH = 120;

function invalid(field: string) {
  return NextResponse.json({ error: `Missing or invalid field: ${field}` }, { status: 400 });
}

function asId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_ID_LENGTH) return null;
  return trimmed;
}

/** `date` must be a real calendar day, not just four-two-two digits. */
function asCalendarDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Round-trip: rejects 2026-02-31 and 2026-13-01, which Postgres `date`
  // would refuse at insert time and which would otherwise look to the caller
  // like a failed save rather than a bad request.
  if (parsed.toISOString().slice(0, 10) !== `${year}-${month}-${day}`) return null;
  return `${year}-${month}-${day}`;
}

/** `time` must be a real wall-clock minute, for Postgres `time`. */
function asWallClockTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${match[1]}:${match[2]}`;
}

/**
 * Normalises an Uzbek mobile number to `+998XXXXXXXXX`.
 * Formatting characters are stripped first, so the UI may send spaces.
 */
function asPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/[\s()+-]/g, "");
  if (!/^998\d{9}$/.test(digits)) return null;
  return `+${digits}`;
}

/** The spec-backed twin of `resolveBookingComposition`, with the same outcomes. */
function composeFromSpec(
  spec: SiteSpec,
  masterId: string,
  serviceIds: string[],
): CompositionOutcome {
  const member = spec.staff.find((entry) => entry.id === masterId);
  if (!member) return { ok: false, reason: "unknown_master" };

  let durationMin = 0;
  let totalSum = 0;
  for (const id of serviceIds) {
    const item = spec.items.find((entry) => entry.id === id && entry.bookable);
    if (!item) return { ok: false, reason: "unknown_service" };
    if (!member.itemIds.includes(id)) return { ok: false, reason: "master_cannot_serve" };
    durationMin += item.durationMin;
    totalSum += item.priceSum;
  }
  if (!(durationMin > 0)) return { ok: false, reason: "unknown_service" };

  return { ok: true, durationMin, totalSum };
}

export async function POST(request: Request) {
  // The tenant is checked before the body is even parsed: an unresolved host
  // has no business creating bookings, whatever it is sending.
  const salonId = resolvedSalonId(request);
  if (!salonId) {
    return tenantNotResolved(`Bookings must be created from a tenant subdomain (*${TENANT_SUFFIX}).`);
  }

  // Then who is calling. Checked before the body is read, so an unverifiable
  // caller never reaches the catalogue lookups.
  const identity = optionalTelegramUser(request);
  if (!identity.ok) return identityFailure(identity.reason);

  let body: CreateBody;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
    }
    body = parsed as CreateBody;
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const masterId = asId(body.masterId);
  if (!masterId) return invalid("masterId");

  if (!Array.isArray(body.serviceIds) || body.serviceIds.length === 0) {
    return invalid("serviceIds");
  }
  if (body.serviceIds.length > MAX_SERVICES_PER_BOOKING) return invalid("serviceIds");
  const serviceIds: string[] = [];
  for (const raw of body.serviceIds) {
    const id = asId(raw);
    if (!id) return invalid("serviceIds");
    // Deduplicate: the same service twice would double the price and the
    // duration for one chair booking.
    if (!serviceIds.includes(id)) serviceIds.push(id);
  }

  const date = asCalendarDate(body.date);
  if (!date) return invalid("date");

  const time = asWallClockTime(body.time);
  if (!time) return invalid("time");

  const customerName =
    typeof body.customerName === "string" ? body.customerName.trim() : "";
  if (!customerName || customerName.length > MAX_NAME_LENGTH) return invalid("customerName");

  const customerPhone = asPhone(body.customerPhone);
  if (!customerPhone) return invalid("customerPhone");

  // ---- Bind the booking contents to the resolved tenant ----
  //
  // A tenant built by the site builder is priced from its *published* spec:
  // that is the catalogue its customers were shown. The draft is never used,
  // so an unpublished price change cannot be booked.
  // An unreadable site store is treated as "no generated site", so a missing
  // `sites` table cannot take the table-backed tenants down with it.
  const site = await loadSite(salonId);
  const published = site.status === "ok" ? site.site.published : null;

  const composition: CompositionOutcome = published
    ? composeFromSpec(published, masterId, serviceIds)
    : await resolveBookingComposition(salonId, masterId, serviceIds);

  let durationMin: number;
  let totalSum: number;

  if (composition.ok) {
    durationMin = composition.durationMin;
    totalSum = composition.totalSum;
  } else if (composition.reason === "degraded") {
    // The catalogue could not be read, so the booking cannot be priced or
    // checked against the tenant. Retryable, and not the caller's fault.
    return bookingServiceUnavailable();
  } else if (composition.reason === "no_db") {
    // Demo mode: no Supabase keys at all. The static catalogue in
    // lib/data/salon.ts describes exactly one salon, so it can only stand in
    // for that tenant — pricing another tenant from it would be a guess.
    if (salonId !== demoSalon.id) return bookingServiceUnavailable();

    const master = getMaster(masterId);
    if (!master) return invalid("masterId");
    if (serviceIds.some((id) => !getService(id))) return invalid("serviceIds");
    if (serviceIds.some((id) => !master.serviceIds.includes(id))) {
      return NextResponse.json(
        { error: "This master does not perform the selected services" },
        { status: 400 },
      );
    }

    const totals = totalFor(serviceIds);
    if (!(totals.minutes > 0)) return invalid("serviceIds");
    durationMin = totals.minutes;
    totalSum = totals.sum;
  } else {
    // unknown_master / unknown_service / master_cannot_serve. One generic
    // message for all three: a caller probing ids must not learn which of them
    // exists at some other salon.
    return NextResponse.json(
      { error: "Unknown or unavailable master or service for this salon" },
      { status: 400 },
    );
  }

  const booking: Booking = {
    id: crypto.randomUUID(),
    // Server-resolved tenant, and a server-side status: a new booking is
    // always `pending`, whatever the body claimed.
    salonId,
    masterId,
    serviceIds,
    date,
    time,
    durationMin,
    totalSum,
    status: "pending",
    customerName,
    customerPhone,
    // From verified initData, or absent. Never from the request body.
    telegramUserId: identity.userId ?? undefined,
    createdAt: new Date().toISOString(),
  };

  const result = await createBooking(booking);

  if (result.persisted) {
    // TODO: notify the salon's Telegram chat via sendMessage once
    // TELEGRAM_BOT_TOKEN is set.
    return NextResponse.json(result, { status: 201 });
  }

  if (result.reason === "conflict") {
    // The double-booking index in supabase/schema.sql refused the slot: that
    // minute is taken for this master. Reported as a conflict so the Mini App
    // can send the customer back to the slot grid instead of showing a
    // booking the salon never received.
    return NextResponse.json(
      { error: "slot_taken", message: "That slot has just been taken." },
      { status: 409 },
    );
  }

  if (result.reason === "rejected") {
    return NextResponse.json(
      { error: "booking_rejected", message: "Booking was refused — the request did not pass validation." },
      { status: 422 },
    );
  }

  // `degraded` / `not_configured`: the request was fine, the datastore was
  // not. The response keeps the documented demo-mode contract — 201 with
  // `persisted: false` plus a warning and a machine-readable `reason`, which
  // lib/save-state.ts turns into the "unavailable" state — so the Mini App
  // keeps the booking locally and never presents it as saved.
  return NextResponse.json(result, { status: 201 });
}

export async function GET(request: Request) {
  // Tenant-scoped listing: only bookings for the resolved tenant are returned.
  // Without a resolved tenant (platform host / direct curl) we do not silently
  // list across all tenants — that would leak another salon's bookings to an
  // unauthenticated caller.
  const salonId = resolvedSalonId(request);
  if (!salonId) {
    return tenantNotResolved("List bookings from your tenant subdomain.");
  }

  // Reading a customer's own bookings requires proof of who they are. This
  // endpoint used to take the customer id straight from the query string:
  // `?telegramUserId=<n>` returned that person's name, phone and appointments
  // to anyone who passed their id, and the id space is small enough to walk.
  const identity = requireTelegramUser(request);
  if (!identity.ok) return identityFailure(identity.reason);

  // A `telegramUserId` parameter is still accepted so older clients keep
  // working, but it is only ever compared against the verified id — never
  // used in its place. A mismatch is an explicit refusal rather than a
  // silently narrowed result, so a client cannot believe it read someone else.
  const claimed = new URL(request.url).searchParams.get("telegramUserId");
  if (claimed && Number(claimed) !== identity.userId) {
    return NextResponse.json(
      {
        error: "forbidden",
        message: "You can only read your own bookings.",
      },
      { status: 403 },
    );
  }

  // Both filters are applied in SQL: this Telegram user, at this salon.
  const result = await listBookings(identity.userId, salonId);

  // An unreachable database must not be presented as an empty list.
  if (result.degraded) return bookingServiceUnavailable();

  return NextResponse.json({ bookings: result.bookings });
}
