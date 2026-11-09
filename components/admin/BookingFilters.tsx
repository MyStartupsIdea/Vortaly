"use client";

import { useI18n } from "@/lib/i18n/provider";
import { cx } from "@/lib/cx";
import type { BookingStatus } from "@/lib/types";

/**
 * The status chips, with the count of matching rows on the right.
 *
 * The filter options and their order are unchanged — "all" first, then the
 * four statuses the admin actually acts on. `draft` is deliberately absent
 * from the chips, as it was before, though a draft row still renders in the
 * table when the "all" chip is active.
 */
export const STATUS_FILTERS = [
  "all",
  "pending",
  "confirmed",
  "paid",
  "cancelled",
] as const;

export type StatusFilter = (typeof STATUS_FILTERS)[number];

export function BookingFilters({
  statusFilter,
  onStatusChange,
  total,
}: {
  statusFilter: BookingStatus | "all";
  onStatusChange: (status: StatusFilter) => void;
  /** How many rows match the current filter, across all pages. */
  total: number;
}) {
  const { t } = useI18n();

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-card border border-hairline bg-surface-raised px-4 py-3">
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onStatusChange(s)}
            className={cx(
              "rounded-full px-3 py-1 text-[12px] font-semibold transition-colors duration-150",
              statusFilter === s
                ? "bg-brand/10 text-brand"
                : "bg-transparent text-ink-muted hover:text-ink",
            )}
          >
            {t(`status.${s}`)}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2 text-[12px] text-ink-muted">
        <span className="whitespace-nowrap">{t("admin.showing")}</span>
        <span className="font-semibold tabular-nums">{total}</span>
        <span className="whitespace-nowrap">{t("admin.entries")}</span>
      </div>
    </section>
  );
}
