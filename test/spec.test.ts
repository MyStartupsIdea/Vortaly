import { describe, expect, it } from "vitest";
import { applyOps, cleanPhone, sanitizeSpec, templateSpec, type SpecBase } from "@/lib/builder/spec";

const base: SpecBase = { slug: "zarnigor", name: "Zarnigor", phone: "901234567", kind: "salon" };

describe("cleanPhone", () => {
  it("keeps nine digits and strips the +998 country code", () => {
    expect(cleanPhone("+998 90 123-45-67")).toBe("901234567");
    expect(cleanPhone("901234567")).toBe("901234567");
  });
  it("rejects anything that is not an Uzbek mobile number", () => {
    expect(cleanPhone("12345")).toBe("");
    expect(cleanPhone({})).toBe("");
  });
});

describe("sanitizeSpec", () => {
  it("never lets the input change the slug, and forces ids into the tenant namespace", () => {
    const spec = sanitizeSpec(
      {
        slug: "someone-else",
        categories: [{ id: "c1", title: { ru: "Волосы", uz: "Soch" } }],
        items: [
          {
            id: "other-salon-s1",
            categoryId: "c1",
            title: { ru: "Стрижка", uz: "Soch olish" },
            durationMin: 60,
            priceSum: 100000,
          },
        ],
        staff: [{ id: "other-salon-m1", name: "X", role: { ru: "Мастер", uz: "Usta" } }],
      },
      base,
    );
    expect(spec.slug).toBe("zarnigor");
    expect(spec.items.every((item) => item.id.startsWith("zarnigor-s"))).toBe(true);
    expect(spec.staff.every((member) => member.id.startsWith("zarnigor-m"))).toBe(true);
  });

  it("survives garbage without throwing and still yields a usable spec", () => {
    const spec = sanitizeSpec("not an object", base);
    expect(spec.slug).toBe("zarnigor");
    expect(spec.categories.length).toBeGreaterThan(0);
    expect(spec.name).toBe("Zarnigor");
  });

  it("clamps prices and durations to sane values", () => {
    const spec = sanitizeSpec(
      {
        categories: [{ id: "c1", title: { ru: "А", uz: "A" } }],
        items: [{ categoryId: "c1", title: { ru: "Б", uz: "B" }, durationMin: -50, priceSum: -1 }],
      },
      base,
    );
    expect(spec.items[0].priceSum).toBeGreaterThanOrEqual(0);
    expect(spec.items[0].durationMin).toBeGreaterThanOrEqual(0);
  });

  it("produces a template for every kind of business", () => {
    for (const kind of ["salon", "cafe", "carwash", "custom"] as const) {
      const spec = templateSpec({ ...base, kind });
      expect(spec.items.length).toBeGreaterThan(0);
      expect(spec.staff.length).toBeGreaterThan(0);
    }
  });
});

describe("applyOps", () => {
  const start = () => templateSpec(base);

  it("applies a price change across all items", () => {
    const before = start();
    const { spec, applied } = applyOps(before, [{ op: "scale_prices", percent: 10 }]);
    expect(applied).toBe(1);
    before.items.forEach((item, i) => {
      if (item.priceSum > 0) expect(spec.items[i].priceSum).toBeGreaterThan(item.priceSum);
    });
  });

  it("ignores unknown operations and fields that are not editable", () => {
    const before = start();
    const { spec, applied } = applyOps(before, [
      { op: "drop_database" },
      { op: "set", field: "slug", value: "hijack" },
    ]);
    expect(applied).toBe(0);
    expect(spec.slug).toBe("zarnigor");
  });

  it("does not mutate the spec it was given", () => {
    const before = start();
    const copy = JSON.stringify(before);
    applyOps(before, [{ op: "remove_item", id: before.items[0].id }]);
    expect(JSON.stringify(before)).toBe(copy);
  });

  it("an invalid value from the model is cleaned, not stored as is", () => {
    const { spec } = applyOps(start(), [{ op: "set", field: "theme", value: "not-a-theme" }]);
    expect(["turquoise", "pomegranate", "saffron", "petrol", "plum", "graphite"]).toContain(spec.theme);
  });

  it("a phone set by the model must still be a valid number", () => {
    const { spec } = applyOps(start(), [{ op: "set", field: "phone", value: "call me maybe" }]);
    expect(spec.phone).toMatch(/^\d{9}$/);
  });
});
