"use client";

import type { BookingOrigin } from "@/lib/data/bookings";
import { useI18n } from "@/lib/i18n/provider";
import { cx } from "@/lib/cx";

/**
 * States where the table's rows actually came from.
 *
 * This is the panel that stops the admin presenting localStorage and demo seed
 * data as Supabase records, so the wording is driven entirely by the counts
 * rather than by anything optimistic: with no server-confirmed row at all the
 * banner turns saffron, because then nothing on screen is real.
 */
export function DataSourceBanner({
  counts,
}: {
  counts: Record<BookingOrigin, number>;
}) {
  const { t } = useI18n();

  /* Which sentence describes the table right now. Demo-only is the loudest
     case: nothing on screen is real. */
  const sourceKey =
    counts.server === 0 && counts.local === 0
      ? "admin.sourceDemo"
      : counts.server > 0 && counts.local + counts.demo > 0
        ? "admin.sourceMixed"
        : counts.server > 0
          ? "admin.sourceLocal"
          : "admin.sourceLocal";

  const nothingIsReal = counts.server === 0;

  return (
    <section
      className={cx(
        "rounded-card border px-4 py-3",
        nothingIsReal
          ? "border-saffron/50 bg-saffron/10"
          : "border-hairline bg-surface-raised",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-display text-[13px] font-bold">{t("admin.sourceTitle")}</p>
        <p className="font-mono text-[11px] text-ink-muted tabular-nums">
          {t("admin.countsLine", {
            server: counts.server,
            local: counts.local,
            demo: counts.demo,
          })}
        </p>
      </div>
      <p className="mt-1 text-[12px] leading-snug">{t(sourceKey)}</p>
    </section>
  );
}
