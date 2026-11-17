import "server-only";

import { loadSite } from "@/lib/builder/store";
import { ownersOf } from "@/lib/owner/store";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Booking } from "@/lib/types";

/**
 * Tells a business's owners about bookings, through the platform bot.
 *
 * Who gets it: every Telegram account linked to the business (owner_links).
 * Telegram only delivers a bot message to someone who has started the bot, so
 * an owner who never pressed Start simply gets nothing; that is logged, not
 * treated as an error.
 *
 * Best effort by design: a notification must never fail or slow down the
 * booking it is about. Callers run it after the response (`after()`), every
 * failure is swallowed here, and only an HTTP status is logged, never the bot
 * token, the chat id or the message.
 */

const SEND_TIMEOUT_MS = 5_000;

export async function sendTelegramMessage(chatId: number, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return false;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) console.warn(`[notify] telegram answered ${response.status}`);
    return response.ok;
  } catch {
    console.warn("[notify] telegram unreachable");
    return false;
  }
}

async function notifyOwners(slug: string, text: string): Promise<number> {
  const owners = await ownersOf(slug);
  if (!owners || owners.length === 0) return 0;
  const sent = await Promise.all(owners.map((id) => sendTelegramMessage(id, text)));
  return sent.filter(Boolean).length;
}

/** "1 250 000" — grouped the way prices are written in Uzbekistan. */
export function formatSum(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** "2026-11-20" → "20.11.2026". */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return year && month && day ? `${day}.${month}.${year}` : iso;
}

/** Plain text, no markup: customer names are user input and are sent as is. */
export function newBookingText(
  booking: Pick<Booking, "date" | "time" | "customerName" | "customerPhone" | "totalSum">,
  details: { business: string; master?: string; services: string[] },
): string {
  return [
    `Новая запись · Yangi yozuv — ${details.business}`,
    `${formatDate(booking.date)} ${booking.time}`,
    details.services.length > 0 ? details.services.join(", ") : null,
    details.master ? `Мастер / Usta: ${details.master}` : null,
    `${booking.customerName}, ${booking.customerPhone}`,
    `${formatSum(booking.totalSum)} сум`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export function cancelledBookingText(
  booking: { date: string; time: string; customerName: string },
  business: string,
): string {
  return [
    `Запись отменена клиентом · Mijoz yozuvni bekor qildi — ${business}`,
    `${formatDate(booking.date)} ${booking.time}`,
    booking.customerName,
  ].join("\n");
}

/** Names for ids, from the published site; falls back to nothing, never to ids. */
async function describe(salonId: string, booking: Pick<Booking, "masterId" | "serviceIds">) {
  const site = await loadSite(salonId);
  const spec = site.status === "ok" ? site.site.published ?? site.site.draft : null;
  return {
    business: spec?.name ?? salonId,
    master: spec?.staff.find((member) => member.id === booking.masterId)?.name || undefined,
    services: (spec?.items ?? [])
      .filter((item) => booking.serviceIds.includes(item.id))
      .map((item) => item.title.ru || item.title.uz),
  };
}

export async function notifyNewBooking(booking: Booking): Promise<void> {
  try {
    const details = await describe(booking.salonId, booking);
    await notifyOwners(booking.salonId, newBookingText(booking, details));
  } catch (error) {
    console.warn("[notify] new booking:", error instanceof Error ? error.message : error);
  }
}

/** The cancel route knows only the id, so the booking is read back first. */
export async function notifyCancelledBooking(id: string, salonId: string): Promise<void> {
  try {
    const db = getSupabaseServer();
    if (!db) return;
    const { data } = await db
      .from("bookings")
      .select("booking_date, booking_time, customer_name")
      .eq("id", id)
      .eq("salon_id", salonId)
      .maybeSingle<{ booking_date: string; booking_time: string; customer_name: string }>();
    if (!data) return;
    const { business } = await describe(salonId, { masterId: "", serviceIds: [] });
    await notifyOwners(
      salonId,
      cancelledBookingText(
        { date: data.booking_date, time: String(data.booking_time).slice(0, 5), customerName: data.customer_name },
        business,
      ),
    );
  } catch (error) {
    console.warn("[notify] cancelled booking:", error instanceof Error ? error.message : error);
  }
}
