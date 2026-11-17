import { describe, expect, it } from "vitest";
import { buildSlots, groupByBlock, worksOn } from "@/lib/booking/slots";
import type { Master } from "@/lib/types";

const master = (over: Partial<Master> = {}): Master => ({
  id: "m1",
  name: "Timur",
  craft: { ru: "", uz: "" },
  rating: 5,
  reviewCount: 0,
  serviceIds: [],
  workdays: [1, 2, 3, 4, 5, 6, 7],
  shiftStart: "10:00",
  shiftEnd: "14:00",
  busy: {},
  tint: "#000",
  ...over,
});

// A Wednesday far from "now", so lead-time rules do not interfere.
const DAY = "2030-01-02";
const EARLY = new Date(2029, 0, 1, 8, 0);

const free = (slots: ReturnType<typeof buildSlots>) => slots.filter((s) => s.available).map((s) => s.time);

describe("buildSlots", () => {
  it("offers every 30-minute start that still ends inside the shift", () => {
    const slots = buildSlots({ masterId: "m1", isoDate: DAY, durationMin: 60, masters: [master()], now: EARLY });
    expect(free(slots)).toEqual(["10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00"]);
  });

  it("blocks every start that would overlap a taken appointment", () => {
    const slots = buildSlots({
      masterId: "m1",
      isoDate: DAY,
      durationMin: 60,
      masters: [master()],
      taken: [{ masterId: "m1", time: "11:00", durationMin: 60 }],
      now: EARLY,
    });
    // 10:30 would run into 11:00; 11:00 and 11:30 are inside it; 12:00 is free again.
    expect(free(slots)).toEqual(["10:00", "12:00", "12:30", "13:00"]);
    expect(slots.find((s) => s.time === "11:00")?.reason).toBe("taken");
  });

  it("blocks a start that overlaps an appointment off the half-hour grid", () => {
    const slots = buildSlots({
      masterId: "m1",
      isoDate: DAY,
      durationMin: 30,
      masters: [master()],
      taken: [{ masterId: "m1", time: "11:15", durationMin: 30 }],
      now: EARLY,
    });
    // 11:15-11:45 overlaps both the 11:00 and the 11:30 slot.
    expect(free(slots)).not.toContain("11:00");
    expect(free(slots)).not.toContain("11:30");
    expect(free(slots)).toContain("12:00");
  });

  it("reads database times with seconds (HH:MM:SS)", () => {
    const slots = buildSlots({
      masterId: "m1",
      isoDate: DAY,
      durationMin: 30,
      masters: [master()],
      taken: [{ masterId: "m1", time: "12:00:00", durationMin: 30 }],
      now: EARLY,
    });
    expect(free(slots)).not.toContain("12:00");
    expect(free(slots)).toContain("12:30");
  });

  it("ignores appointments of other masters", () => {
    const slots = buildSlots({
      masterId: "m1",
      isoDate: DAY,
      durationMin: 30,
      masters: [master()],
      taken: [{ masterId: "m2", time: "10:00", durationMin: 240 }],
      now: EARLY,
    });
    expect(free(slots)).toContain("10:00");
  });

  it("with any master, a slot is free while at least one master is free", () => {
    const a = master({ id: "a" });
    const b = master({ id: "b" });
    const slots = buildSlots({
      masterId: "any",
      isoDate: DAY,
      durationMin: 30,
      masters: [a, b],
      taken: [{ masterId: "a", time: "10:00", durationMin: 30 }],
      now: EARLY,
    });
    const ten = slots.find((s) => s.time === "10:00");
    expect(ten?.available).toBe(true);
    expect(ten?.freeMasterIds).toEqual(["b"]);
  });

  it("with any master, never offers a master before their shift starts", () => {
    const early = master({ id: "early", shiftStart: "10:00", shiftEnd: "12:00" });
    const late = master({ id: "late", shiftStart: "11:00", shiftEnd: "14:00" });
    const slots = buildSlots({ masterId: "any", isoDate: DAY, durationMin: 30, masters: [early, late], now: EARLY });
    expect(slots.find((s) => s.time === "10:00")?.freeMasterIds).toEqual(["early"]);
    expect(slots.find((s) => s.time === "12:30")?.freeMasterIds).toEqual(["late"]);
  });

  it("returns nothing on a day off", () => {
    const off = master({ workdays: [1] }); // Mondays only; DAY is a Wednesday
    expect(worksOn(off, DAY)).toBe(false);
    expect(buildSlots({ masterId: "m1", isoDate: DAY, durationMin: 30, masters: [off], now: EARLY })).toEqual([]);
  });

  it("keeps the next hour of today unbookable", () => {
    const now = new Date(2030, 0, 2, 10, 40);
    const slots = buildSlots({ masterId: "m1", isoDate: DAY, durationMin: 30, masters: [master()], now });
    expect(slots.find((s) => s.time === "11:30")?.reason).toBe("past");
    expect(slots.find((s) => s.time === "12:00")?.available).toBe(true);
  });

  it("groups slots into morning, day and evening", () => {
    const long = master({ shiftStart: "09:00", shiftEnd: "20:00" });
    const groups = groupByBlock(buildSlots({ masterId: "m1", isoDate: DAY, durationMin: 30, masters: [long], now: EARLY }));
    expect(groups.map((g) => g.block)).toEqual(["morning", "day", "evening"]);
  });
});
