import type { Locale } from "./types";

const LOCALE_TAG: Record<Locale, string> = {
  ru: "ru-RU",
  uz: "uz-Latn-UZ",
};

/** 120000 -> "120 000 сум" / "120 000 soʻm" */
export function formatSum(sum: number, locale: Locale): string {
  const grouped = new Intl.NumberFormat(LOCALE_TAG[locale], {
    maximumFractionDigits: 0,
  })
    .format(sum)
    // Intl may emit a non-breaking or narrow space; normalise to one we control.
    .replace(/[\s\u00a0\u202f]/g, "\u2009");
  return locale === "ru" ? `${grouped} сум` : `${grouped} soʻm`;
}

/** 90 -> "1 ч 30 мин" / "1 s 30 min" */
export function formatDuration(minutes: number, locale: Locale): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hourUnit = locale === "ru" ? "ч" : "s";
  const minUnit = locale === "ru" ? "мин" : "min";
  if (h === 0) return `${m} ${minUnit}`;
  if (m === 0) return `${h} ${hourUnit}`;
  return `${h} ${hourUnit} ${m} ${minUnit}`;
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function fromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: Date): number {
  return date.getDay() === 0 ? 7 : date.getDay();
}

export function formatWeekday(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], { weekday: "short" })
    .format(date)
    .replace(".", "");
}

export function formatDayMonth(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    day: "numeric",
    month: "long",
  }).format(date);
}

export function formatMonthYear(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    month: "long",
    year: "numeric",
  }).format(date);
}

/** "+998 90 123 45 67" from a bare 998901234567. */
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 12) return raw;
  return `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
}
