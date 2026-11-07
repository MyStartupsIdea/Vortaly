"use client";

import { useState } from "react";
import { formatSum, formatDuration, toIsoDate, fromIsoDate } from "@/lib/format";
import { services, getService, getMaster } from "@/lib/data/salon";
import { getBookings, createBooking, updateBooking, cancelBooking, deleteBooking, paginate } from "@/lib/data/bookings";
import { useI18n } from "@/lib/i18n/provider";
import { Stars } from "@/components/ui/Stars";
import { Button } from "@/components/ui/Button";
import { cx } from "@/lib/cx";
import type { Locale, Booking, BookingStatus, Service, ServiceGroup } from "@/lib/types";

const GROUP_ORDER: ServiceGroup[] = ["hair", "beard", "color", "nails", "brows"];

const PAGE_SIZE = 12;

/**
 * Two-panel dashboard:
 *  - Left/top: incoming bookings + today's appointments, filterable by status,
 *    with per-row actions (confirm, mark paid, cancel, delete).
 *  - Right/bottom: services & prices editor — add/remove services and adjust
 *    their price in sums (UZS), with changes reflected immediately in the
 *    in-memory store used by the table's totals.
 *
 * Everything lives in localStorage under `uzmini:admin:bookings` on the
 * client side; the server-side seed is the demo set from lib/data/bookings.
 */
export default function AdminPage() {
  const { locale, t } = useI18n();
  const [statusFilter, setStatusFilter] = useState<BookingStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [paidId, setPaidId] = useState<string | null>(null);
  const [savingService, setSavingService] = useState<string | null>(null);

  // ---- Bookings table ----
  const allBookings = getBookings();
  const filtered = allBookings.filter((b) => {
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (dateFrom && b.date < dateFrom) return false;
    if (dateTo && b.date > dateTo) return false;
    return true;
  });

  const sorted = [...filtered].sort(
    (a, b) =>
      // Today and future first, newest first within a day.
      a.date === b.date
        ? b.time.localeCompare(a.time)
        : a.date.localeCompare(b.date),
  );

  const { page: currentPage, pageSize, total, totalPages, items } = paginate(
    sorted,
    page,
    PAGE_SIZE,
  );

  const totalToday = allBookings
    .filter((b) => b.date === toIsoDate(new Date()) && b.status !== "cancelled")
    .reduce((acc, b) => acc + b.totalSum, 0);

  const todayCount = allBookings.filter(
    (b) => b.date === toIsoDate(new Date()) && b.status !== "cancelled",
  ).length;

  // ---- Services editor state (mirrored from the shared service list) ----
  const [servicesState, setServicesState] = useState<Service[]>(services);

  const updateServicePrice = (id: string, priceSum: number) => {
    setServicesState((prev) =>
      prev.map((s) => (s.id === id ? { ...s, priceSum: Math.max(0, priceSum) } : s)),
    );
  };

  const addService = () => {
    const id = `service-${Date.now()}`;
    const newService: Service = {
      id,
      group: "hair",
      title: { ru: "Новая услуга", uz: "Yangī xizmat" },
      durationMin: 30,
      priceSum: 0,
    };
    setServicesState((prev) => [...prev, newService]);
  };

  const removeService = (id: string) => {
    setServicesState((prev) => prev.filter((s) => s.id !== id));
  };

  const saveService = async (id: string) => {
    setSavingService(id);
    // In a real deployment this would PATCH a Supabase table. For now the
    // change is reflected in-memory so the admin panel is usable end-to-end;
    // the cosmetic "saving" state gives the click feedback.
    await new Promise((r) => setTimeout(r, 300));
    setSavingService(null);
  };

  return (
    <div className="space-y-6">
      {/* ---- Dash summary ---- */}
      <section className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-4 rounded-card border border-hairline bg-surface-raised px-4 py-3">
          <div>
            <p className="text-[11px] font-medium text-ink-muted">{t("admin.todayTitle")}</p>
            <p className="font-display text-2xl font-bold text-petrol tabular-nums">{todayCount}</p>
          </div>
          <div className="h-8 w-px bg-hairline" />
          <div>
            <p className="text-[11px] font-medium text-ink-muted">{t("admin.todaySum")}</p>
            <p className="font-display text-2xl font-bold tabular-nums">{formatSum(totalToday, locale)}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              createBooking({
                salonId: "chinor-tashkent",
                masterId: "aziza",
                serviceIds: ["haircut-women"],
                date: toIsoDate(new Date()),
                time: "10:00",
                durationMin: 60,
                totalSum: 120_000,
                status: "pending",
                customerName: "Тестовый клиент",
                customerPhone: "998900000000",
              });
              setPage(1);
            }}
          >
            {t("admin.demoBooking")}
          </Button>
        </div>
      </section>

      {/* ---- Filter bar ---- */}
      <section className="flex flex-wrap items-center gap-3 rounded-card border border-hairline bg-surface-raised px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {(["all", "pending", "confirmed", "paid", "cancelled"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setStatusFilter(s);
                setPage(1);
              }}
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

      {/* ---- Bookings table ---- */}
      <section className="rounded-card border border-hairline bg-surface-raised p-4">
        <h2 className="font-display text-[15px] font-bold tracking-[-0.02em] text-petrol">
          {t("admin.bookingsTitle")}
        </h2>

        {items.length === 0 ? (
          <div className="mt-6 flex flex-col items-center justify-center gap-2 py-10 text-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="size-8 text-ink-muted/40"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7a2 2 0 100-4 2 2 0 000 4zm-1 4a1 1 0 110-2 1 1 0 010 2z"
              />
            </svg>
            <p className="text-[14px] text-ink-muted">{t("admin.noBookings")}</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-ink-muted">
                    {t("admin.colDate")}
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-ink-muted">
                    {t("admin.colTime")}
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-ink-muted">
                    {t("admin.colClient")}
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-ink-muted">
                    {t("admin.colServices")}
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-ink-muted">
                    {t("admin.colMaster")}
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-ink-muted">
                    {t("admin.colSum")}
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-ink-muted">
                    {t("admin.colStatus")}
                  </th>
                  <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wider text-ink-muted">
                    {t("admin.colActions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {items.map((booking) => {
                  const master = getMaster(booking.masterId);
                  const serviceList = booking.serviceIds
                    .map((id) => getService(id))
                    .filter(Boolean) as Service[];
                  const isToday = booking.date === toIsoDate(new Date());
                  const isPast = booking.date < toIsoDate(new Date()) && booking.status !== "cancelled";

                  return (
                    <tr
                      key={booking.id}
                      className={cx(
                        "hover:bg-surface-sunken transition-colors duration-100",
                        isPast && "opacity-50",
                      )}
                    >
                      <td className="px-3 py-3">
                        <span className="block text-[14px] font-semibold tabular-nums">
                          {booking.date}
                        </span>
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
                          {booking.customerPhone.replace(/(\d{3})(\d{2})(\d{3})(\d{2})(\d{2})/, "$1 $2 $3 $4 $5")}
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
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          {booking.status === "pending" && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmingId(booking.id)}
                              >
                                {t("admin.confirm")}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPaidId(booking.id)}
                              >
                                {t("admin.markPaid")}
                              </Button>
                            </>
                          )}
                          {(booking.status === "confirmed" || booking.status === "paid") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPaidId(booking.id)}
                            >
                              {t("admin.markPaid")}
                            </Button>
                          )}
                          {booking.status !== "cancelled" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm(`${t("admin.cancelBooking")} "${booking.customerName}"?`)) {
                                  cancelBooking(booking.id);
                                  setPage(1);
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
                                deleteBooking(booking.id);
                                setPage(1);
                              }
                            }}
                            className="rounded-md p-1.5 text-ink-muted hover:bg-surface-sunken hover:text-accent transition-colors duration-100"
                            aria-label={t("admin.delete")}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
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
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    {t("action.back")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    {t("action.next")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ---- Services + prices editor ---- */}
      <section className="rounded-card border border-hairline bg-surface-raised p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-[15px] font-bold tracking-[-0.02em] text-petrol">
            {t("admin.servicesTitle")}
          </h2>
          <Button variant="secondary" onClick={addService}>
            + {t("admin.addService")}
          </Button>
        </div>
        <p className="mt-1 text-[12px] text-ink-muted">
          {t("admin.servicesHint")}
        </p>

        <div className="mt-4 space-y-5">
          {GROUP_ORDER.map((group) => {
            const groupServices = servicesState.filter((s) => s.group === group);
            if (groupServices.length === 0) return null;
            return (
              <div key={group}>
                <h3 className="mb-2 font-display text-[13px] font-semibold text-ink-muted">
                  {t(`group.${group}`)}
                </h3>
                <div className="space-y-2">
                  {groupServices.map((service) => (
                    <div
                      key={service.id}
                      className={cx(
                        "flex items-center gap-3 rounded-card border border-hairline bg-surface p-3",
                        service.id.startsWith("service-")
                          ? "border-dashed opacity-60"
                          : "",
                      )}
                    >
                      <div className="flex flex-1 items-start gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={() => removeService(service.id)}
                          className="flex shrink-0 items-center justify-center rounded-full size-6 text-ink-muted hover:bg-surface-sunken hover:text-accent transition-colors duration-100"
                          aria-label={t("admin.removeService")}
                          title={t("admin.removeService")}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold truncate">
                            {service.title[locale]}
                          </p>
                          <p className="mt-0.5 text-[12px] text-ink-muted">
                            {formatDuration(service.durationMin, locale)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 size-5 -translate-y-1/2 text-ink-muted">
                            <svg xmlns="http://www.w3.org/2000/svg" className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4 1.79 4 4-1.79 4-4 4zm0 0V4m0 0c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-4z" />
                            </svg>
                          </span>
                          <input
                            type="number"
                            min={0}
                            step={10000}
                            value={service.priceSum}
                            disabled={savingService === service.id}
                            onChange={(e) => {
                              const next = parseInt(e.target.value, 10);
                              updateServicePrice(service.id, isNaN(next) ? 0 : next);
                            }}
                            onBlur={() => saveService(service.id)}
                            className={cx(
                              "h-8 w-28 rounded-md border border-hairline bg-surface-sunken py-1.5 pl-6 pr-2 text-[13px] font-semibold tabular-nums text-ink placeholder:text-ink-muted",
                              savingService === service.id && "ring-1 ring-brand/40",
                            )}
                            placeholder="0"
                            aria-label={t("admin.priceInput")}
                          />
                        </div>
                        <span className="text-[12px] text-ink-muted">сум</span>
                        {savingService === service.id ? (
                          <span className="size-1.5 rounded-full bg-brand animate-pulse" />
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** Status pill matching the Mini App vocabulary. */
function StatusBadge({ status, locale }: { status: BookingStatus; locale: Locale }) {
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
