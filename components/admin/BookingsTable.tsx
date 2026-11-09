"use client";

import { AdminEmptyState } from "@/components/admin/AdminStates";
import { OriginBadge, StatusBadge } from "@/components/admin/BookingBadges";
import { Button } from "@/components/ui/Button";
import type { StoredBooking } from "@/lib/data/bookings";
import { getMaster, getService } from "@/lib/data/salon";
import { formatDuration, formatSum, toIsoDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { cx } from "@/lib/cx";
import type { Locale, Service } from "@/lib/types";

/**
 * The bookings table: header, rows, per-row actions and pagination.
 *
 * It renders the page it is given and reports intent upward — it does not
 * read the store, mutate anything, or decide what is on the page. Sorting,
 * filtering and pagination all still happen in app/admin/page.tsx, so the
 * extraction changed structure only.
 *
 * Both destructive actions still ask first, via the same window.confirm the
 * page used before. That prompt does not render inside the Telegram webview
 * and should become an in-page dialog, but replacing it is a behavioural
 * change and is left for the pass that adds the mutation states.
 */

export interface BookingsTableProps {
  /** The current page of rows, already filtered, sorted and sliced. */
  items: StoredBooking[];
  locale: Locale;
  currentPage: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  onConfirm: (id: string) => void;
  onMarkPaid: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
}

/** The column headings, in order. Each is a dictionary key. */
const COLUMNS = [
  "admin.colDate",
  "admin.colTime",
  "admin.colClient",
  "admin.colServices",
  "admin.colMaster",
  "admin.colSum",
  "admin.colStatus",
] as const;

export function BookingsTable({
  items,
  locale,
  currentPage,
  totalPages,
  onPrevPage,
  onNextPage,
  onConfirm,
  onMarkPaid,
  onCancel,
  onDelete,
}: BookingsTableProps) {
  const { t } = useI18n();

  if (items.length === 0) {
    return <AdminEmptyState message={t("admin.noBookings")} />;
  }

  return (
    <div className="mt-4 space-y-3">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-hairline">
            {COLUMNS.map((key) => (
              <th
                key={key}
                className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-ink-muted"
              >
                {t(key)}
              </th>
            ))}
            <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wider text-ink-muted">
              {t("admin.colActions")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {items.map((booking) => (
            <BookingRow
              key={booking.id}
              booking={booking}
              locale={locale}
              onConfirm={onConfirm}
              onMarkPaid={onMarkPaid}
              onCancel={onCancel}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3">
          <p className="text-[12px] text-ink-muted">
            {t("admin.pageOf", { current: currentPage, total: totalPages })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={currentPage <= 1}
              onClick={onPrevPage}
            >
              {t("action.back")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={onNextPage}
            >
              {t("action.next")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function BookingRow({
  booking,
  locale,
  onConfirm,
  onMarkPaid,
  onCancel,
  onDelete,
}: {
  booking: StoredBooking;
  locale: Locale;
  onConfirm: (id: string) => void;
  onMarkPaid: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useI18n();

  const master = getMaster(booking.masterId);
  const serviceList = booking.serviceIds
    .map((id) => getService(id))
    .filter(Boolean) as Service[];
  const isToday = booking.date === toIsoDate(new Date());
  const isPast = booking.date < toIsoDate(new Date()) && booking.status !== "cancelled";

  return (
    <tr
      className={cx(
        "hover:bg-surface-sunken transition-colors duration-100",
        isPast && "opacity-50",
      )}
    >
      <td className="px-3 py-3">
        <span className="block text-[14px] font-semibold tabular-nums">{booking.date}</span>
        {isToday && (
          <span className="mt-0.5 inline-block rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">
            {t("time.today")}
          </span>
        )}
      </td>

      <td className="px-3 py-3">
        <span className="text-[14px] font-semibold tabular-nums">{booking.time}</span>
      </td>

      <td className="px-3 py-3">
        <p className="text-[14px] font-semibold">{booking.customerName}</p>
        <a
          href={`tel:+${booking.customerPhone}`}
          className="mt-0.5 inline-block text-[12px] text-ink-muted hover:text-ink"
        >
          {booking.customerPhone.replace(
            /(\d{3})(\d{2})(\d{3})(\d{2})(\d{2})/,
            "$1 $2 $3 $4 $5",
          )}
        </a>
      </td>

      <td className="px-3 py-3">
        <ul className="mt-0.5 space-y-0.5">
          {serviceList.map((s) => (
            <li key={s.id} className="truncate text-[12px] text-ink-muted">
              {s.title[locale]}
            </li>
          ))}
        </ul>
      </td>

      <td className="px-3 py-3">
        {master ? (
          <div className="flex items-center gap-2">
            <span
              className="size-6 shrink-0 rounded-full font-display text-[14px] font-bold text-white"
              style={{ backgroundColor: master.tint }}
            >
              {master.name.charAt(0)}
            </span>
            <span className="text-[13px] font-medium">{master.name}</span>
          </div>
        ) : (
          <span className="text-[13px] text-ink-muted">—</span>
        )}
      </td>

      <td className="px-3 py-3">
        <span className="text-[14px] font-semibold tabular-nums">
          {formatSum(booking.totalSum, locale)}
        </span>
        <span className="ml-1 text-[11px] text-ink-muted">
          {formatDuration(booking.durationMin, locale)}
        </span>
      </td>

      <td className="px-3 py-3">
        <StatusBadge status={booking.status} locale={locale} />
        {/* Status is what the booking is; provenance is whether it exists
            anywhere but this browser. */}
        <OriginBadge origin={booking.origin} />
      </td>

      <td className="px-3 py-3">
        <div className="flex justify-end gap-2">
          {booking.status === "pending" && (
            <>
              <Button variant="ghost" size="sm" onClick={() => onConfirm(booking.id)}>
                {t("admin.confirm")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onMarkPaid(booking.id)}>
                {t("admin.markPaid")}
              </Button>
            </>
          )}
          {(booking.status === "confirmed" || booking.status === "paid") && (
            <Button variant="ghost" size="sm" onClick={() => onMarkPaid(booking.id)}>
              {t("admin.markPaid")}
            </Button>
          )}
          {booking.status !== "cancelled" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm(`${t("admin.cancelBooking")} "${booking.customerName}"?`)) {
                  onCancel(booking.id);
                }
              }}
            >
              {t("admin.cancel")}
            </Button>
          )}
          <button
            type="button"
            onClick={() => {
              if (confirm(`${t("admin.deleteBooking")} "${booking.customerName}"?`)) {
                onDelete(booking.id);
              }
            }}
            className="rounded-md p-1.5 text-ink-muted hover:bg-surface-sunken hover:text-accent transition-colors duration-100"
            aria-label={t("admin.delete")}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="size-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}
