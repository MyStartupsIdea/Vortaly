import type { Booking, BookingStatus } from "@/lib/types";
import { totalFor } from "@/lib/data/salon";

const STORAGE_KEY = "uzmini:admin:bookings";

/**
 * Where a record in this store actually came from.
 *
 *  - `server` — the API confirmed it was written to Supabase and read back.
 *  - `local`  — it exists in this browser only. Either the write was refused,
 *               the datastore was unreachable, or it was made here by hand.
 *  - `demo`   — seed data that was never real and must never be counted or
 *               presented as a booking.
 *
 * This lives in the client store rather than on the `Booking` wire type on
 * purpose: it is a fact about *this browser's copy* of a record, not something
 * the server sends, so it has no business in the API contract.
 */
export type BookingOrigin = "server" | "local" | "demo";

export interface StoredBooking extends Booking {
  origin: BookingOrigin;
}

/**
 * A record read back out of localStorage. `origin` is optional because a
 * record written before provenance was tracked will not have one.
 */
type SerializableBooking = Booking & { origin?: BookingOrigin };

function nowIso(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function defaults(overrides: Partial<StoredBooking>): StoredBooking {
  const booking = {
    // Unprovenanced records are treated as local, never as server-saved: the
    // UI may only ever understate what was stored, never overstate it.
    origin: "local" as BookingOrigin,
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
  } as StoredBooking;

  // A booking lasts as long as its services take. Without this the chair is
  // released too early and the grid offers a time that is really taken.
  if (overrides.durationMin === undefined) {
    const { minutes } = totalFor(booking.serviceIds);
    if (minutes > 0) booking.durationMin = minutes;
  }

  return booking;
}

function loadBookings(): StoredBooking[] {
  if (typeof window === "undefined") return [...DEMO_BOOKINGS];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEMO_BOOKINGS];
    const parsed = JSON.parse(raw) as SerializableBooking[];
    return parsed.map((b) => defaults(b));
  } catch {
    return [...DEMO_BOOKINGS];
  }
}

function saveBookings(bookings: StoredBooking[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
  } catch {
    // localStorage may be unavailable in some SSR runtimes — ignore.
  }
}

/**
 * In-memory demo seed. Every entry is marked `demo` so no surface can show it
 * as a real booking: the admin table labels it and excludes it from the day's
 * totals. Once Supabase is live these helpers become queries in
 * lib/supabase/* — the Booking type is already aligned.
 */
export const DEMO_BOOKINGS: StoredBooking[] = [
  defaults({
    origin: "demo",
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
    origin: "demo",
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
    origin: "demo",
    id: "bk-03",
    customerName: "Ильдар Темиров",
    customerPhone: "998931556677",
    date: new Date().toISOString().slice(0, 10),
    time: "14:00",
    serviceIds: ["haircut-men", "beard-trim"],
    masterId: "rustam",
    totalSum: 130_000,
    status: "paid",
    createdAt: "2026-11-06T10:05:00",
  }),
  defaults({
    origin: "demo",
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
    origin: "demo",
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
    origin: "demo",
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
let clientBookings: StoredBooking[] | null = null;

function resolvedBookings(): StoredBooking[] {
  if (typeof window === "undefined") return [...DEMO_BOOKINGS];
  if (clientBookings) return clientBookings;
  clientBookings = loadBookings();
  return clientBookings;
}

export function getBookings(): StoredBooking[] {
  return resolvedBookings();
}

export function getBookingsForDate(isoDate: string): StoredBooking[] {
  return resolvedBookings().filter((b) => b.date === isoDate);
}

/** True when the store holds nothing but the demo seed. */
export function isShowingDemoOnly(): boolean {
  const list = resolvedBookings();
  return list.length > 0 && list.every((b) => b.origin === "demo");
}

/** How many records of each provenance the store currently holds. */
export function originCounts(): Record<BookingOrigin, number> {
  const counts: Record<BookingOrigin, number> = { server: 0, local: 0, demo: 0 };
  for (const booking of resolvedBookings()) counts[booking.origin] += 1;
  return counts;
}

/**
 * Adds a record to this browser's store.
 *
 * `origin` is required rather than defaulted, so a caller has to state whether
 * the server confirmed the write. That is the whole point: the previous
 * signature let a booking the API never stored be added indistinguishably
 * from one it did.
 */
export function createBooking(
  input: Omit<Booking, "id" | "createdAt"> & Partial<Pick<Booking, "id" | "createdAt">>,
  origin: BookingOrigin,
): StoredBooking {
  const booking = defaults({ ...input, origin });
  const list = resolvedBookings();
  list.unshift(booking);
  saveBookings(list);
  clientBookings = list;
  return booking;
}

export function updateBooking(id: string, patch: Partial<StoredBooking>): StoredBooking | null {
  const list = resolvedBookings();
  const idx = list.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  const updated = { ...list[idx], ...patch } as StoredBooking;
  list[idx] = updated;
  saveBookings(list);
  clientBookings = list;
  return updated;
}

export function cancelBooking(id: string): StoredBooking | null {
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
