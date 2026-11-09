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

/**
 * Status pill matching the Mini App vocabulary.
 *
 * The labels are inlined rather than read from the dictionaries, as they were
 * before this was extracted. Folding them into lib/i18n is worth doing, but it
 * is a localisation change rather than a structural one, so it is left for the
 * pass that also moves the admin shell's own hardcoded nav labels.
 */
export function StatusBadge({
  status,
  locale,
}: {
  status: BookingStatus;
  locale: Locale;
}) {
  const map = {
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

  const colorMap = {
    draft: "bg-ink-muted/10 text-ink-muted",
    pending: "bg-saffron/10 text-saffron",
    confirmed: "bg-brand/10 text-brand",
    paid: "bg-turquoise/10 text-turquoise",
    cancelled: "bg-pomegranate/10 text-pomegranate",
  };

  return (
    <span
      className={cx(
        "inline-block rounded-full px-2 py-0.5 text-[11px] font-medium",
        colorMap[status],
      )}
    >
      {map[locale][status]}
    </span>
  );
}
