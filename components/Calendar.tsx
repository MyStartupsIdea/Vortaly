"use client";

import { useMemo, useState } from "react";
import { useBooking } from "@/lib/booking/store";
import { useCatalog } from "@/lib/booking/catalog";
import type { Master } from "@/lib/types";
import { upcomingDays, worksOn } from "@/lib/booking/slots";
import {
  formatDayMonth,
  formatMonthYear,
  formatWeekday,
  isoWeekday,
  toIsoDate,
} from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { useTelegram } from "@/lib/telegram-provider";
import { cx } from "@/lib/cx";

const RAIL_DAYS = 14;
const BOOKABLE_DAYS = 60;

/** Does anyone who can do the chosen services work that day? */
function salonOpenFor(
  allMasters: Master[],
  isoDate: string,
  masterId: string | null,
  serviceIds: string[],
): boolean {
  const pool =
    masterId && masterId !== "any"
      ? allMasters.filter((m) => m.id === masterId)
      : allMasters.filter((m) => serviceIds.every((id) => m.serviceIds.includes(id)));
  return pool.some((m) => worksOn(m, isoDate));
}

export function Calendar() {
  const { draft, setDay } = useBooking();
  const { t, locale } = useI18n();
  const { haptic } = useTelegram();
  const { masters } = useCatalog();
  const salonOpen = (isoDate: string, masterId: string | null, serviceIds: string[]) =>
    salonOpenFor(masters, isoDate, masterId, serviceIds);
  const [monthOpen, setMonthOpen] = useState(false);

  const now = useMemo(() => new Date(), []);
  const today = toIsoDate(now);
  const days = useMemo(() => upcomingDays(RAIL_DAYS, now), [now]);

  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));

  const lastBookable = useMemo(() => {
    const d = new Date(now);
    d.setDate(d.getDate() + BOOKABLE_DAYS);
    return toIsoDate(d);
  }, [now]);

  const pick = (iso: string) => {
    setDay(iso);
    haptic("select");
  };

  const label = (date: Date) => {
    const iso = toIsoDate(date);
    if (iso === today) return t("time.today");
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (iso === toIsoDate(tomorrow)) return t("time.tomorrow");
    return null;
  };

  // Month grid, Monday first — the week as it is read in Uzbekistan.
  const monthCells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const lead = isoWeekday(first) - 1;
    return [
      ...Array.from({ length: lead }, () => null),
      ...Array.from(
        { length: daysInMonth },
        (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1),
      ),
    ];
  }, [cursor]);

  const weekdayHeads = useMemo(
    () => upcomingDays(7, new Date(2024, 0, 1)).map((d) => formatWeekday(d, locale)),
    [locale],
  );

  const canGoBack = cursor > new Date(now.getFullYear(), now.getMonth(), 1);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 px-5">
        <h3 className="font-display text-[13px] font-semibold text-ink-muted">
          {t("time.pickDay")}
        </h3>
        <button
          type="button"
          onClick={() => setMonthOpen((v) => !v)}
          aria-expanded={monthOpen}
          className="text-[13px] font-semibold text-brand"
        >
          {monthOpen ? t("action.close") : formatMonthYear(cursor, locale)}
        </button>
      </div>

      {!monthOpen && (
        <div className="rail mt-3 scroll-px-5 gap-2 px-5">
          {days.map((date) => {
            const iso = toIsoDate(date);
            const open = salonOpen(iso, draft.masterId, draft.serviceIds);
            const selected = draft.date === iso;
            const tag = label(date);

            return (
              <button
                key={iso}
                type="button"
                disabled={!open}
                aria-pressed={selected}
                onClick={() => pick(iso)}
                className={cx(
                  "rail-item w-[62px] rounded-tile border px-1 py-2.5 text-center transition-colors duration-150",
                  selected
                    ? "glaze-brand border-transparent text-brand-ink"
                    : open
                      ? "glaze border-hairline"
                      : "biscuit border-transparent opacity-50",
                )}
              >
                <span
                  className={cx(
                    "block text-[11px] font-medium",
                    selected ? "text-brand-ink/75" : "text-ink-muted",
                  )}
                >
                  {tag ?? formatWeekday(date, locale)}
                </span>
                <span className="mt-0.5 block font-display text-[19px] leading-none font-bold tabular-nums">
                  {date.getDate()}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {monthOpen && (
        <div className="mt-3 px-5">
          <div className="flex items-center justify-between">
            <button
              type="button"
              disabled={!canGoBack}
              onClick={() =>
                setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
              }
              className="grid size-9 place-items-center rounded-tile border border-hairline disabled:opacity-35"
              aria-label={t("action.back")}
            >
              <svg viewBox="0 0 16 16" fill="none" className="size-4 stroke-current">
                <path d="M10 3 5 8l5 5" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            <span className="font-display text-[15px] font-semibold">
              {formatMonthYear(cursor, locale)}
            </span>
            <button
              type="button"
              onClick={() =>
                setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
              }
              className="grid size-9 place-items-center rounded-tile border border-hairline"
              aria-label={t("action.next")}
            >
              <svg viewBox="0 0 16 16" fill="none" className="size-4 stroke-current">
                <path d="M6 3l5 5-5 5" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] text-ink-muted">
            {weekdayHeads.map((head, i) => (
              <span key={i}>{head}</span>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {monthCells.map((date, i) => {
              if (!date) return <span key={`blank-${i}`} />;
              const iso = toIsoDate(date);
              const bookable =
                iso >= today && iso <= lastBookable &&
                salonOpen(iso, draft.masterId, draft.serviceIds);
              const selected = draft.date === iso;

              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!bookable}
                  aria-pressed={selected}
                  aria-label={formatDayMonth(date, locale)}
                  onClick={() => {
                    pick(iso);
                    setMonthOpen(false);
                  }}
                  className={cx(
                    "aspect-square rounded-tile text-[14px] font-semibold tabular-nums transition-colors duration-150",
                    selected
                      ? "glaze-brand text-brand-ink"
                      : bookable
                        ? "glaze border border-hairline"
                        : "text-ink-muted/40",
                  )}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
