import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyDbFailure } from "@/lib/supabase/bookings";
import { slugify, transliterate } from "@/lib/translit";
import { cancelledBookingText, formatDate, formatSum, newBookingText } from "@/lib/telegram/notify";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("slugify", () => {
  it("turns Cyrillic and Uzbek names into DNS-safe slugs", () => {
    expect(slugify("Зарнигор")).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(slugify("Buxoro Coffee!")).toBe("buxoro-coffee");
  });
  it("is idempotent", () => {
    for (const name of ["Салон «Шахзода»", "O'zbek Choyxona", "  ---  "]) {
      expect(slugify(slugify(name))).toBe(slugify(name));
    }
  });
  it("transliterates", () => {
    expect(transliterate("Ташкент")).toMatch(/tashkent/i);
  });
});

describe("notification texts", () => {
  it("formats sums and dates the local way", () => {
    expect(formatSum(1250000)).toBe("1 250 000");
    expect(formatDate("2026-11-20")).toBe("20.11.2026");
  });

  it("names the date, service, master, customer and price", () => {
    const text = newBookingText(
      { date: "2026-11-20", time: "14:30", customerName: "Aziza", customerPhone: "+998901234567", totalSum: 150000 },
      { business: "Zarnigor", master: "Timur", services: ["Стрижка"] },
    );
    expect(text).toContain("20.11.2026 14:30");
    expect(text).toContain("Стрижка");
    expect(text).toContain("Timur");
    expect(text).toContain("Aziza, +998901234567");
    expect(text).toContain("150 000 сум");
  });

  it("leaves out what it does not know", () => {
    const text = newBookingText(
      { date: "2026-11-20", time: "14:30", customerName: "A", customerPhone: "1", totalSum: 0 },
      { business: "Z", services: [] },
    );
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("Мастер");
  });

  it("describes a cancellation", () => {
    expect(cancelledBookingText({ date: "2026-11-20", time: "09:00", customerName: "B" }, "Z")).toContain(
      "20.11.2026 09:00",
    );
  });
});

describe("root domain guard", () => {
  it("never treats a shared hosting domain as ours", async () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "vercel.app");
    const config = await import("@/lib/domain/config");
    expect(config.TENANT_SUBDOMAINS_ENABLED).toBe(false);
  });

  it("uses subdomains on our own domain", async () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "https://Vortaly.com/");
    const config = await import("@/lib/domain/config");
    expect(config.ROOT_DOMAIN).toBe("vortaly.com");
    expect(config.TENANT_SUBDOMAINS_ENABLED).toBe(true);
  });
});

describe("booking conflicts from the database", () => {
  it("report both a same-start and an overlapping booking as a conflict", () => {
    expect(classifyDbFailure({ code: "23505", message: "duplicate key" })).toBe("conflict");
    expect(classifyDbFailure({ code: "23P01", message: "conflicting key value violates exclusion constraint" })).toBe(
      "conflict",
    );
  });
  it("keep other constraint failures as rejected", () => {
    expect(classifyDbFailure({ code: "23514", message: "check" })).toBe("rejected");
  });
});
