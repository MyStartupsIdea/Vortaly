"use client";

import { SaveBadge } from "@/components/ui/SaveBadge";
import type { BookingOrigin } from "@/lib/data/bookings";
import { useI18n } from "@/lib/i18n/provider";
import { cx } from "@/lib/cx";
import type { BookingStatus, Locale } from "@/lib/types";

/**
 * The two badges a booking row carries, which answer different questions:
 * `StatusBadge` says what stage the booking is at, `OriginBadge` says whether
 * the record exists anywhere other than this browser. Keeping them side by
 * side here makes it hard to later conflate the two.
 */

/**
 * Where the row came from. Rendered under every status pill so no row in the
 * table can be mistaken for a Supabase record when it is not one.
 */
export function OriginBadge({ origin }: { origin: BookingOrigin }) {
  const { t } = useI18n();

  if (origin === "server") {
    return <SaveBadge state="saved" variant="dot" className="mt-1" />;
  }

  return (
    <span
      className={cx(
        "mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium",
        origin === "demo" ? "text-ink-muted" : "text-saffron",
      )}
      title={t(origin === "demo" ? "origin.demo" : "origin.local")}
    >
      <span
        aria-hidden
        className={cx(
          "size-1.5 flex-none rounded-full",
          origin === "demo" ? "bg-ink-muted/45" : "bg-saffron",
        )}
      />
      {t(origin === "demo" ? "origin.demoShort" : "origin.localShort")}
    </span>
  );
}

const STATUS_LABEL = {
  ru: {
    draft: "Черновик",
    pending: "Ждёт подтверждения",
    confirmed: "Подтверждена",
    paid: "Оплачена",
    cancelled: "Отменена",
  },
  uz: {
    draft: "Qoralama",
    pending: "Tasdiqlanishi kutilmoqda",
    confirmed: "Tasdiqlangan",
    paid: "Toʻlangan",
    cancelled: "Bekor qilingan",
  },
} as const;

export function statusLabel(status: BookingStatus, locale: Locale): string {
  return STATUS_LABEL[locale][status];
}

const STATUS_STYLE: Record<BookingStatus, { pill: string; dot: string }> = {
  draft: { pill: "bg-surface-sunken text-ink-muted", dot: "bg-ink-muted" },
  pending: { pill: "bg-saffron/10 text-saffron ring-saffron/25", dot: "bg-saffron" },
  confirmed: { pill: "bg-brand-tint text-brand ring-brand/20", dot: "bg-brand" },
  paid: { pill: "bg-surface-sunken text-ink ring-hairline", dot: "bg-ink" },
  cancelled: { pill: "bg-surface-sunken text-ink-muted line-through decoration-ink-muted/40", dot: "bg-ink-muted" },
};

/** Status pill with a dot, after the Stitch reference. */
export function StatusBadge({ status, locale }: { status: BookingStatus; locale: Locale }) {
  const style = STATUS_STYLE[status];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold whitespace-nowrap ring-1 ring-transparent ring-inset",
        style.pill,
      )}
    >
      <span aria-hidden className={cx("size-1.5 rounded-full", style.dot)} />
      {statusLabel(status, locale)}
    </span>
  );
}
