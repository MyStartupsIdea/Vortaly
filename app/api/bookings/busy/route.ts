import { NextResponse } from "next/server";
import { resolvedSalonId, tenantNotResolved } from "@/lib/domain/tenant-context";
import { listBusy } from "@/lib/supabase/bookings";

/**
 * GET /api/bookings/busy?date=YYYY-MM-DD
 *
 * The taken slots of the resolved tenant for one day, so the time grid can
 * strike them out before a customer picks one. Returns master id, start time
 * and duration only — never who booked.
 *
 * A degraded database answers with an empty list and `degraded: true` rather
 * than an error: the grid then shows every slot, and the unique index in
 * supabase/schema.sql still refuses a real double booking at insert time.
 */
export async function GET(request: Request) {
  const salonId = resolvedSalonId(request);
  if (!salonId) return tenantNotResolved("Occupancy is read per tenant.");

  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const result = await listBusy(salonId, date);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
