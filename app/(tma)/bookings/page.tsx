"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { cancelBooking, getBookings } from "@/lib/data/bookings";
import { getMaster, getService } from "@/lib/data/salon";
import { formatDayMonth, formatDuration, formatSum, fromIsoDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { useTelegram } from "@/lib/telegram-provider";
import type { Booking, BookingStatus } from "@/lib/types";
import { cx } from "@/lib/cx";

const STATUS_TONE: Record<BookingStatus, string> = {
  draft: "text-ink-muted",
  pending: "text-saffron",
  confirmed: "text-brand",
  paid: "text-brand",
  cancelled: "text-ink-muted",
};

function BookingRow({
  booking,
  justCreated,
  onCancel,
}: {
  booking: Booking;
  justCreated: boolean;
  onCancel: () => void;
}) {
  const { t, tr, locale } = useI18n();
  const { haptic } = useTelegram();

  const master = booking.masterId === "any" ? null : getMaster(booking.masterId);
  const cancelled = booking.status === "cancelled";

  return (
    <li
      className={cx(
        "rounded-card border bg-surface-raised p-4",
        justCreated ? "border-brand" : "border-hairline",
        cancelled && "opacity-55",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-[17px] font-bold tracking-[-0.01em]">
          {formatDayMonth(fromIsoDate(booking.date), locale)}, {booking.time}
        </span>
        <span className={cx("flex-none text-[12px] font-semibold", STATUS_TONE[booking.status])}>
          {t(`status.${booking.status}`)}
        </span>
      </div>

      <p className="mt-1 text-[13px] text-ink-muted">
        {master ? master.name : t("master.anyTitle")}
      </p>

      <ul className="mt-3 space-y-0.5 text-[14px]">
        {booking.serviceIds.map((id) => {
          const service = getService(id);
          if (!service) return null;
          return (
            <li key={id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{tr(service.title)}</span>
              <span className="flex-none text-ink-muted tabular-nums">
                {formatSum(service.priceSum, locale)}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-hairline pt-3">
        <span className="text-[13px] text-ink-muted">
          {formatDuration(booking.durationMin, locale)}
        </span>
        <span className="font-semibold tabular-nums">
          {formatSum(booking.totalSum, locale)}
        </span>
      </div>

      {!cancelled && (
        <div className="mt-3 flex gap-2">
          {booking.status !== "paid" && (
            <Link
              href={`/checkout/${booking.id}`}
              className="flex-1 rounded-card border border-hairline px-4 py-2.5 text-center text-[14px] font-semibold"
            >
              {t("pay.submit")}
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              onCancel();
              haptic("press");
            }}
            className="rounded-card px-4 py-2.5 text-[14px] font-semibold text-accent"
          >
            {t("booking.cancel")}
          </button>
        </div>
      )}
    </li>
  );
}

function BookingsContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useI18n();

  // Loaded after mount: the store serves a seed during SSR, so reading it in
  // render would put the wrong list into the static HTML.
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  useEffect(() => setBookings(getBookings()), []);

  const hydrated = bookings !== null;
  const createdId = params.get("created");

  const cancel = (id: string) => {
    cancelBooking(id);
    setBookings([...getBookings()]);
  };

  return (
    <main className="min-h-screen pb-10">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 pt-5 pb-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="text-[13px] font-semibold text-brand"
          >
            {t("nav.salon")}
          </button>
          <h1 className="font-display text-[22px] leading-tight font-bold tracking-[-0.02em]">
            {t("nav.bookings")}
          </h1>
        </div>
        <LanguageSwitcher />
      </div>

      {createdId && (
        <div className="mx-5 mt-4 rounded-card border border-brand bg-brand/8 p-4">
          <p className="font-display text-[16px] font-bold">{t("booking.created")}</p>
          <p className="mt-1 text-[13px] text-ink-muted">{t("booking.createdHint")}</p>
        </div>
      )}

      {!hydrated ? (
        <div className="space-y-2 px-5 pt-5">
          {[0, 1].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-card bg-surface-sunken" />
          ))}
        </div>
      ) : bookings!.length === 0 ? (
        <div className="px-5 pt-16 text-center">
          <p className="font-display text-[18px] font-bold">{t("booking.empty")}</p>
          <p className="mx-auto mt-2 max-w-[28ch] text-[14px] text-ink-muted">
            {t("booking.emptyHint")}
          </p>
          <Button className="mt-6" onClick={() => router.push("/")}>
            {t("booking.emptyCta")}
          </Button>
        </div>
      ) : (
        <ul className="space-y-2 px-5 pt-4">
          {bookings!.map((booking) => (
            <BookingRow
              key={booking.id}
              booking={booking}
              justCreated={booking.id === createdId}
              onCancel={() => cancel(booking.id)}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

export default function BookingsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <BookingsContent />
    </Suspense>
  );
}
