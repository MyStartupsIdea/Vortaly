import type { Booking, BookingStatus, PaymentProvider } from "@/lib/types";
import { totalFor } from "@/lib/data/salon";

const STORAGE_KEY = "uzmini:admin:bookings";

type SerializableBooking = Omit<Booking, never>;

function nowIso(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function defaults(overrides: Partial<Booking>): Booking {
  const booking = {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    salonId: "chinor-tashkent",
    masterId: "aziza",
    serviceIds: ["haircut-women"],
    date: new Date().toISOString().slice(0, 10),
    time: "10:00",
    durationMin: 60,
    totalSum: 120_000,
    status: "pending",
    customerName: "",
    customerPhone: "",
    telegramUserId: undefined,
    createdAt: nowIso(),
    ...overrides,
  } as Booking;

  // A booking lasts as long as its services take. Without this the chair is
  // released too early and the grid offers a time that is really taken.
  if (overrides.durationMin === undefined) {
    const { minutes } = totalFor(booking.serviceIds);
    if (minutes > 0) booking.durationMin = minutes;
  }

  return booking;
}

function loadBookings(): Booking[] {
  if (typeof window === "undefined") return [...DEMO_BOOKINGS];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEMO_BOOKINGS];
    const parsed = JSON.parse(raw) as SerializableBooking[];
    return parsed.map((b) => defaults(b) as Booking);
  } catch {
    return [...DEMO_BOOKINGS];
  }
}

function saveBookings(bookings: Booking[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
  } catch {
    // localStorage may be unavailable in some SSR runtimes — ignore.
  }
}

// In-memory demo seed. Once Supabase is live, replace these helpers with
// queries in lib/supabase/queries.ts — the Booking type is already aligned.
export const DEMO_BOOKINGS: Booking[] = [
  defaults({
    id: "bk-01",
    customerName: "Анна Иванова",
    customerPhone: "998901234567",
    date: new Date().toISOString().slice(0, 10),
    time: "10:00",
    serviceIds: ["haircut-women", "styling"],
    masterId: "aziza",
    totalSum: 220_000,
    status: "confirmed",
    createdAt: "2026-11-06T09:12:00",
  }),
  defaults({
    id: "bk-02",
    customerName: "Дилшода Рахимова",
    customerPhone: "998911223344",
    date: new Date().toISOString().slice(0, 10),
    time: "11:30",
    serviceIds: ["manicure", "brows"],
    masterId: "dilnoza",
    totalSum: 240_000,
    status: "paid",
    telegramUserId: 123456789,
    createdAt: "2026-11-06T09:41:00",
  }),
  defaults({
    id: "bk-03",
    customerName: "Ильдар Темиров",
    customerPhone: "998931556677",
    date: new Date().toISOString().slice(0, 10),
    time: "14:00",
    serviceIds: ["haircut-men", "beard-trim"],
    masterId: "rustam",
    totalSum: 130_000,
    status: "paid",
    paymentProvider: "click" as PaymentProvider,
    createdAt: "2026-11-06T10:05:00",
  }),
  defaults({
    id: "bk-04",
    customerName: "Марина Козлова",
    customerPhone: "998942221100",
    date: new Date(Date.now() + 86400_000).toISOString().slice(0, 10),
    time: "16:00",
    serviceIds: ["color-highlights"],
    masterId: "aziza",
    totalSum: 480_000,
    status: "pending",
    createdAt: "2026-11-06T11:20:00",
  }),
  defaults({
    id: "bk-05",
    customerName: "Sevinch Iskandarova",
    customerPhone: "998977112233",
    date: new Date().toISOString().slice(0, 10),
    time: "17:30",
    serviceIds: ["pedicure", "lashes"],
    masterId: "dilnoza",
    totalSum: 400_000,
    status: "draft",
    createdAt: "2026-11-06T12:02:00",
  }),
  defaults({
    id: "bk-06",
    customerName: "Bobur Narzullaev",
    customerPhone: "998901998877",
    date: new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10),
    time: "09:00",
    serviceIds: ["haircut-men", "shave-razor"],
    masterId: "jasur",
    totalSum: 150_000,
    status: "pending",
    createdAt: "2026-11-06T13:00:00",
  }),
];

/**
 * Admin-only state layer. On the client side this persists to localStorage
 * under `uzmini:admin:bookings`; the server side returns the DEMO_BOOKINGS
 * seed so the page never renders empty on first SSR paint.
 */
let clientBookings: Booking[] | null = null;

function resolvedBookings(): Booking[] {
  if (typeof window === "undefined") return [...DEMO_BOOKINGS];
  if (clientBookings) return clientBookings;
  clientBookings = loadBookings();
  return clientBookings;
}

export function getBookings(): Booking[] {
  return resolvedBookings();
}

export function getBookingsForDate(isoDate: string): Booking[] {
  return resolvedBookings().filter((b) => b.date === isoDate);
}

export function createBooking(input: Omit<Booking, "id" | "createdAt">): Booking {
  const booking = defaults(input);
  const list = resolvedBookings();
  list.unshift(booking);
  saveBookings(list);
  clientBookings = list;
  return booking;
}

export function updateBooking(id: string, patch: Partial<Booking>): Booking | null {
  const list = resolvedBookings();
  const idx = list.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  const updated = { ...list[idx], ...patch } as Booking;
  list[idx] = updated;
  saveBookings(list);
  clientBookings = list;
  return updated;
}

export function cancelBooking(id: string): Booking | null {
  return updateBooking(id, { status: "cancelled" });
}

export function deleteBooking(id: string): boolean {
  const list = resolvedBookings();
  const next = list.filter((b) => b.id !== id);
  if (next.length === list.length) return false;
  saveBookings(next);
  clientBookings = next;
  return true;
}

/**
 * Lightweight pagination helpers for the admin table — keeps the rendered
 * window small when the salon has many bookings over time.
 */
export function paginate<T>(items: T[], page: number, pageSize: number): {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: T[];
} {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    pageSize,
    total,
    totalPages,
    items: items.slice(start, start + pageSize),
  };
}
