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

export interface PersistResult {
  booking: Booking;
  /** True when the row really landed in Postgres. */
  persisted: boolean;
  warning?: string;
}

export async function createBooking(booking: Booking): Promise<PersistResult> {
  const db = getSupabaseServer();
  if (!db) {
    return {
      booking,
      persisted: false,
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
      // A missing table is the expected state before the schema is applied.
      return { booking, persisted: false, warning: error.message };
    }
    return { booking: fromRow(data), persisted: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isNetworkError(err)) {
      return {
        booking,
        persisted: false,
        warning: "Supabase unavailable — booking was not stored server-side.",
      };
    }
    console.error("[bookings.createBooking] unexpected error:", message);
    return {
      booking,
      persisted: false,
      warning: "Failed to create booking: " + message,
    };
  }
}

export async function listBookings(
  telegramUserId: number,
  salonId?: string,
): Promise<Booking[]> {
  const db = getSupabaseServer();
  if (!db) return [];

  try {
    let query = db
      .from(TABLE)
      .select("*")
      .eq("telegram_user_id", telegramUserId);
    if (salonId) {
      query = query.eq("salon_id", salonId);
    }

    const { data, error } = await query
      .order("booking_date", { ascending: false })
      .returns<BookingRow[]>();

    if (error || !data) return [];
    return data.map(fromRow);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isNetworkError(err)) {
      console.warn("[bookings.listBookings] Supabase network error, returning empty list (demo mode)");
      return [];
    }
    console.error("[bookings.listBookings] unexpected error:", message);
    return [];
  }
}

export async function setBookingStatus(
  id: string,
  status: BookingStatus,
  salonId: string,
): Promise<boolean> {
  const db = getSupabaseServer();
  if (!db) return false;

  try {
    // Tenant isolation: only update the booking when both the id and the
    // salon_id match. Without this, any caller that knows a booking uuid could
    // flip its status for any salon on the platform.
    const { error } = await db
      .from(TABLE)
      .update({ status })
      .eq("id", id)
      .eq("salon_id", salonId);
    return !error;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isNetworkError(err)) {
      console.warn("[bookings.setBookingStatus] Supabase network error, status not changed");
      return false;
    }
    console.error("[bookings.setBookingStatus] unexpected error:", message);
    return false;
  }
}
