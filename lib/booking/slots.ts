import { isoWeekday, toIsoDate } from "@/lib/format";
import { masters as allMasters } from "@/lib/data/salon";
import { getBookingsForDate } from "@/lib/data/bookings";
import type { Master } from "@/lib/types";

export const SLOT_STEP_MIN = 30;

export type SlotBlock = "morning" | "day" | "evening";

export interface Slot {
  time: string;
  available: boolean;
  /** Why the slot cannot be taken — drives the tile's matte/struck styling. */
  reason?: "taken" | "past" | "tooLate";
  block: SlotBlock;
  /** Masters free at this time, so "first available" can resolve to a person. */
  freeMasterIds: string[];
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toHhMm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function blockOf(minutes: number): SlotBlock {
  if (minutes < 12 * 60) return "morning";
  if (minutes < 17 * 60) return "day";
  return "evening";
}

/** A busy stretch of a day, in minutes from midnight: [start, end). */
interface Interval {
  start: number;
  end: number;
}

function intervalOf(startTime: string, durationMin: number): Interval {
  const start = toMinutes(startTime);
  return { start, end: start + Math.max(durationMin, SLOT_STEP_MIN) };
}

/**
 * Stretches this master is already committed on a given day, taken from the
 * shared booking store, so the grid reflects real appointments — including one
 * the customer has just made.
 *
 * Kept as minute intervals rather than grid steps: an appointment that starts
 * off the half-hour grid (11:15, entered by the salon) must still block every
 * slot it overlaps, and a set of "HH:MM" steps would miss it.
 */
function occupied(master: Master, isoDate: string, taken: BusySpan[]): Interval[] {
  const busy = (master.busy[isoDate] ?? []).map((time) => intervalOf(time, SLOT_STEP_MIN));
  for (const booking of getBookingsForDate(isoDate)) {
    if (booking.masterId !== master.id) continue;
    if (booking.status === "cancelled") continue;
    busy.push(intervalOf(booking.time, booking.durationMin));
  }
  // Appointments other customers made, as reported by the server.
  for (const span of taken) {
    if (span.masterId !== master.id) continue;
    busy.push(intervalOf(span.time, span.durationMin));
  }
  return busy;
}

/** One live appointment: who is busy, from when, for how long. No customer data. */
export interface BusySpan {
  masterId: string;
  time: string;
  durationMin: number;
}

export function worksOn(master: Master, isoDate: string): boolean {
  const [y, m, d] = isoDate.split("-").map(Number);
  return master.workdays.includes(isoWeekday(new Date(y, m - 1, d)));
}

/** Can the master start `durationMin` of work at `startMin` and finish in shift? */
function fits(master: Master, busy: Interval[], startMin: number, durationMin: number): boolean {
  const end = startMin + durationMin;
  if (startMin < toMinutes(master.shiftStart) || end > toMinutes(master.shiftEnd)) return false;
  return busy.every((span) => end <= span.start || startMin >= span.end);
}

export interface BuildSlotsArgs {
  /** A master id, or "any" to offer whoever is free. */
  masterId: string;
  isoDate: string;
  durationMin: number;
  /** Candidate masters when masterId is "any". */
  candidates?: Master[];
  /** The tenant's masters. Defaults to the built-in salon's. */
  masters?: Master[];
  /** Server-reported appointments for this date. */
  taken?: BusySpan[];
  /** Injected in tests; defaults to now. */
  now?: Date;
}

export function buildSlots({
  masterId,
  isoDate,
  durationMin,
  candidates,
  masters = allMasters,
  taken = [],
  now = new Date(),
}: BuildSlotsArgs): Slot[] {
  const pool =
    masterId === "any"
      ? (candidates ?? masters).filter((m) => worksOn(m, isoDate))
      : masters.filter((m) => m.id === masterId && worksOn(m, isoDate));

  if (pool.length === 0) return [];

  const duration = Math.max(durationMin, SLOT_STEP_MIN);
  const gridStart = Math.min(...pool.map((m) => toMinutes(m.shiftStart)));
  const gridEnd = Math.max(...pool.map((m) => toMinutes(m.shiftEnd)));

  const busyByMaster = new Map(pool.map((m) => [m.id, occupied(m, isoDate, taken)]));
  const isToday = isoDate === toIsoDate(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const slots: Slot[] = [];
  for (let t = gridStart; t + duration <= gridEnd; t += SLOT_STEP_MIN) {
    const time = toHhMm(t);
    const freeMasterIds = pool
      .filter((m) => fits(m, busyByMaster.get(m.id)!, t, duration))
      .map((m) => m.id);

    // Walk-ins need lead time: the next hour is never bookable.
    const past = isToday && t < nowMin + 60;

    let reason: Slot["reason"];
    if (past) reason = "past";
    else if (freeMasterIds.length === 0) reason = "taken";

    slots.push({
      time,
      available: !past && freeMasterIds.length > 0,
      reason,
      block: blockOf(t),
      freeMasterIds,
    });
  }
  return slots;
}

export function groupByBlock(slots: Slot[]): { block: SlotBlock; slots: Slot[] }[] {
  const order: SlotBlock[] = ["morning", "day", "evening"];
  return order
    .map((block) => ({ block, slots: slots.filter((s) => s.block === block) }))
    .filter((group) => group.slots.length > 0);
}

/** The next `count` days starting today, for the day strip. */
export function upcomingDays(count: number, now = new Date()): Date[] {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return d;
  });
}
