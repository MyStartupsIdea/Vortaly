"use client";

import type { ReactNode } from "react";
import { formatSum } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/types";

/**
 * The day's two figures, plus whatever controls belong beside them.
 *
 * Both numbers are computed by the page from demo-free rows; this component
 * only renders them. `showDemoNote` surfaces the caveat that the totals skip
 * seeded records, so a reader can tell why the figures may be lower than the
 * row count suggests.
 */
export function TodaySummary({
  todayCount,
  totalToday,
  locale,
  showDemoNote,
  actions,
}: {
  todayCount: number;
  totalToday: number;
  locale: Locale;
  showDemoNote: boolean;
  actions?: ReactNode;
}) {
  const { t } = useI18n();

  return (
    <section className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-4 rounded-card border border-hairline bg-surface-raised px-4 py-3">
        <div>
          <p className="text-[11px] font-medium text-ink-muted">{t("admin.todayTitle")}</p>
          <p className="font-display text-2xl font-bold text-ink tabular-nums">
            {todayCount}
          </p>
        </div>
        <div className="h-8 w-px bg-hairline" />
        <div>
          <p className="text-[11px] font-medium text-ink-muted">{t("admin.todaySum")}</p>
          <p className="font-display text-2xl font-bold tabular-nums">
            {formatSum(totalToday, locale)}
          </p>
        </div>
      </div>

      {showDemoNote && (
        <p className="text-[11px] leading-snug text-ink-muted">{t("admin.todayRealNote")}</p>
      )}

      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </section>
  );
}
