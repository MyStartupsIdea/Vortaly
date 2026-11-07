import { NextResponse } from "next/server";
import { totalFor } from "@/lib/data/salon";
import { createBooking, listBookings } from "@/lib/supabase/bookings";
import type { Booking } from "@/lib/types";

interface CreateBody {
  masterId?: string;
  serviceIds?: string[];
  date?: string;
  time?: string;
  customerName?: string;
  customerPhone?: string;
  telegramUserId?: number;
}

function invalid(field: string) {
  return NextResponse.json({ error: `Missing or invalid field: ${field}` }, { status: 400 });
}

export async function POST(request: Request) {
  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  if (!body.serviceIds?.length) return invalid("serviceIds");
  if (!body.masterId) return invalid("masterId");
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return invalid("date");
  if (!body.time || !/^\d{2}:\d{2}$/.test(body.time)) return invalid("time");
  if (!body.customerName?.trim()) return invalid("customerName");
  if (!/^\+?998\d{9}$/.test((body.customerPhone ?? "").replace(/[\s()-]/g, ""))) {
    return invalid("customerPhone");
  }
  if (!body.masterId || typeof body.masterId !== "string" || body.masterId.length < 1) {
    return invalid("masterId");
  }
  if (!body.serviceIds || !Array.isArray(body.serviceIds) || body.serviceIds.length === 0) {
    return invalid("serviceIds");
  }
  if (!body.date || typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return invalid("date");
  }
  if (!body.time || typeof body.time !== "string" || !/^\d{2}:\d{2}$/.test(body.time)) {
    return invalid("time");
  }    const { sum, minutes } = totalFor(body.serviceIds);

  // Multi-tenant: read the resolved tenant from the middleware header.
  // The middleware (middleware.ts) resolves *.uzmini.uz subdomains to a salon_id
  // and stashes it on x-salon-id. When the platform host or a non-tenant request
  // hits this endpoint directly, fall back to the demo salon so the flow still
  // works without DNS/subdomain setup.
  const salonId =
    (request.headers.get("x-salon-id") as string | null) ?? "chinor-tashkent";

  const booking: Booking = {
    id: crypto.randomUUID(),
    salonId,
    masterId: body.masterId,
    serviceIds: body.serviceIds,
    date: body.date,
    time: body.time,
    durationMin: minutes,
    totalSum: sum,
    status: "pending",
    customerName: body.customerName.trim(),
    customerPhone: body.customerPhone!.replace(/[\s()-]/g, ""),
    telegramUserId: body.telegramUserId,
    createdAt: new Date().toISOString(),
  };

  const result = await createBooking(booking);

  // TODO: notify the salon's Telegram chat via sendMessage once
  // TELEGRAM_BOT_TOKEN is set.
  return NextResponse.json(result, { status: 201 });
}

export async function GET(request: Request) {
  const telegramUserId = new URL(request.url).searchParams.get("telegramUserId");
  if (!telegramUserId) {
    return NextResponse.json({ error: "telegramUserId is required" }, { status: 400 });
  }

  // Scope the listing to the resolved tenant when available. Without a tenant
  // header (platform host / direct curl), list across all tenants so an admin
  // can still see everything — in prod this endpoint should itself be tenant-
  // gated behind auth.
  const salonId = request.headers.get("x-salon-id") as string | null;
  const bookings = await listBookings(
    Number(telegramUserId),
    salonId ?? undefined,
  );
  return NextResponse.json({ bookings });
}
