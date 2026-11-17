import { describe, expect, it } from "vitest";
import { stripUnbackedClaims } from "@/lib/builder/claims";
import { templateSpec } from "@/lib/builder/spec";

const T = (ru: string, uz: string) => ({ ru, uz });

const site = () => ({
  ...templateSpec({ slug: "bilim", name: "Bilim", phone: "901234567", kind: "custom" }),
  tagline: T("Учебный центр будущего", "Kelajak oʻquv markazi"),
  about: T(
    "Мы преподаём английский и IT. Опытные преподаватели гарантируют успех! Пробный урок бесплатно.",
    "Biz ingliz tili va IT oʻqitamiz. Tajribali oʻqituvchilar muvaffaqiyatni kafolatlaydi! Sinov darsi bepul.",
  ),
  highlights: [
    T("Бесплатный пробный урок", "Bepul sinov darsi"),
    T("Опытные преподаватели", "Tajribali oʻqituvchilar"),
    T("Лучшие цены в городе", "Shahardagi eng yaxshi narxlar"),
    T("Гибкий график", "Moslashuvchan jadval"),
  ],
});

describe("stripUnbackedClaims", () => {
  const brief = "Учебный центр: английский и IT, группы и индивидуально. Пробный урок бесплатно.";

  it("drops praise the owner did not claim, keeps the facts", () => {
    const spec = stripUnbackedClaims(site(), brief);
    expect(spec.highlights.map((h) => h.ru)).toEqual(["Бесплатный пробный урок", "Гибкий график"]);
    expect(spec.about.ru).toBe("Мы преподаём английский и IT. Пробный урок бесплатно.");
    expect(spec.about.uz).toBe("Biz ingliz tili va IT oʻqitamiz. Sinov darsi bepul.");
  });

  it("keeps a claim the owner made themselves", () => {
    const spec = stripUnbackedClaims(site(), `${brief} У нас опытные преподаватели с многолетним стажем.`);
    expect(spec.highlights.map((h) => h.ru)).toContain("Опытные преподаватели");
    // Experience is backed, a guarantee still is not.
    expect(spec.about.ru).not.toContain("гарантируют");
  });

  it("recognises the claim in Uzbek too", () => {
    const spec = stripUnbackedClaims(site(), "Ingliz tili va IT kurslari, tajribali oʻqituvchilar");
    expect(spec.highlights.map((h) => h.uz)).toContain("Tajribali oʻqituvchilar");
  });

  it("never touches services, prices or staff", () => {
    const before = site();
    const after = stripUnbackedClaims(before, brief);
    expect(after.items).toEqual(before.items);
    expect(after.staff).toEqual(before.staff);
    expect(after.categories).toEqual(before.categories);
  });

  it("clears a boastful tagline", () => {
    const boastful = { ...site(), tagline: T("Лучший салон Ташкента", "Toshkentdagi eng yaxshi salon") };
    expect(stripUnbackedClaims(boastful, "Салон красоты").tagline).toEqual({ ru: "", uz: "" });
  });

  it("keeps the about text bilingual or empty, never half", () => {
    const lopsided = { ...site(), about: T("Опытные мастера.", "Ustalarimiz bor.") };
    const spec = stripUnbackedClaims(lopsided, "Салон");
    expect(Boolean(spec.about.ru)).toBe(Boolean(spec.about.uz));
  });
});
