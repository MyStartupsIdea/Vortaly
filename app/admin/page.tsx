"use client";

import { useState } from "react";
import { AdminSection } from "@/components/admin/AdminStates";
import { BookingFilters } from "@/components/admin/BookingFilters";
import { BookingsTable } from "@/components/admin/BookingsTable";
import { DataSourceBanner } from "@/components/admin/DataSourceBanner";
import { TodaySummary } from "@/components/admin/TodaySummary";
import { formatDuration, toIsoDate } from "@/lib/format";
import { services } from "@/lib/data/salon";
import {
  getBookings,
  createBooking,
  cancelBooking,
  deleteBooking,
  originCounts,
  paginate,
} from "@/lib/data/bookings";
import { useI18n } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/Button";
import { cx } from "@/lib/cx";
import type { BookingStatus, Service, ServiceGroup } from "@/lib/types";

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
 *
 * Because none of that is Supabase, the table never presents a row as though
 * it came from the database: a banner names the source, every row carries its
 * provenance, and the day's totals exclude demo rows so the numbers are not
 * padded with records that were never real.
 *
 * This page owns all of the data work — reading the store, filtering, sorting,
 * paginating and mutating. The components under components/admin/ render what
 * they are handed, which is what keeps the two concerns separable when the
 * real, authorised data source arrives.
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
  /** Hides everything the server has not confirmed. Off by default so the
      table is never silently incomplete, but one click away. */
  const [savedOnly, setSavedOnly] = useState(false);

  // ---- Bookings table ----
  const allBookings = getBookings();
  const counts = originCounts();

  const filtered = allBookings.filter((b) => {
    if (savedOnly && b.origin !== "server") return false;
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

  const { page: currentPage, total, totalPages, items } = paginate(
    sorted,
    page,
    PAGE_SIZE,
  );

  /* Demo rows are excluded from both figures: a seeded booking is not money
     anyone owes, and counting it would misstate the day. */
  const countable = allBookings.filter(
    (b) =>
      b.origin !== "demo" &&
      b.date === toIsoDate(new Date()) &&
      b.status !== "cancelled",
  );

  const totalToday = countable.reduce((acc, b) => acc + b.totalSum, 0);
  const todayCount = countable.length;

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
      {/* ---- Where this data actually comes from ---- */}
      <DataSourceBanner counts={counts} />

      {/* ---- Dash summary ---- */}
      <TodaySummary
        todayCount={todayCount}
        totalToday={totalToday}
        locale={locale}
        showDemoNote={counts.demo > 0}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                createBooking(
                  {
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
                  },
                  "local",
                );
                setPage(1);
              }}
            >
              {t("admin.demoBooking")}
            </Button>

            <button
              type="button"
              aria-pressed={savedOnly}
              onClick={() => {
                setSavedOnly((v) => !v);
                setPage(1);
              }}
              className={cx(
                "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors duration-150",
                savedOnly
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-hairline text-ink-muted hover:text-ink",
              )}
            >
              {t("admin.realOnly")}
            </button>
          </>
        }
      />

      {/* ---- Filter bar ---- */}
      <BookingFilters
        statusFilter={statusFilter}
        total={total}
        onStatusChange={(s) => {
          setStatusFilter(s);
          setPage(1);
        }}
      />

      {/* ---- Bookings table ---- */}
      <AdminSection title={t("admin.bookingsTitle")}>
        <BookingsTable
          items={items}
          locale={locale}
          currentPage={currentPage}
          totalPages={totalPages}
          onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
          onNextPage={() => setPage((p) => Math.min(totalPages, p + 1))}
          onConfirm={(id) => setConfirmingId(id)}
          onMarkPaid={(id) => setPaidId(id)}
          onCancel={(id) => {
            cancelBooking(id);
            setPage(1);
          }}
          onDelete={(id) => {
            deleteBooking(id);
            setPage(1);
          }}
        />
      </AdminSection>

      {/* ---- Services + prices editor ---- */}
      <AdminSection
        title={t("admin.servicesTitle")}
        action={
          <Button variant="secondary" onClick={addService}>
            + {t("admin.addService")}
          </Button>
        }
      >
        <p className="mt-1 text-[12px] text-ink-muted">{t("admin.servicesHint")}</p>
        <p className="mt-1 text-[12px] text-saffron">{t("admin.serviceLocalOnly")}</p>

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
      </AdminSection>
    </div>
  );
}
