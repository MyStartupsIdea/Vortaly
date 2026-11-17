"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusBadge, statusLabel } from "@/components/admin/BookingBadges";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/Button";
import { fetchSite } from "@/lib/api/builder";
import {
  fetchOwnerBookings,
  setOwnerBookingStatus,
  type BookingsFailure,
  type OwnerBooking,
  type OwnerBookingStatus,
} from "@/lib/api/owner";
import type { SiteSpec } from "@/lib/builder/spec";
import { formatDayMonth, formatDuration, formatSum, formatWeekday, fromIsoDate, toIsoDate } from "@/lib/format";
import { cx } from "@/lib/cx";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/dictionaries";

/**
 * The owner's bookings for one business: what is coming up, in order, with
 * the three things an owner does to a booking — confirm it, mark it paid,
 * cancel it. Past bookings are kept below, newest first.
 *
 * Access is the server's: /api/owner/bookings answers only for a business
 * linked to the signed-in owner.
 */

const FAILURE: Record<BookingsFailure, MessageKey> = {
  not_signed_in: "ob.signInAgain",
  forbidden: "ob.forbidden",
  unavailable: "ob.unavailable",
  error: "o.requestFailed",
};

/** The next steps an owner may take, mirroring the server's transition table. */
const ACTIONS: Record<OwnerBookingStatus, Array<{ to: OwnerBookingStatus; label: MessageKey; primary?: boolean }>> = {
  draft: [{ to: "cancelled", label: "ob.cancel" }],
  pending: [
    { to: "confirmed", label: "ob.confirm", primary: true },
    { to: "cancelled", label: "ob.cancel" },
  ],
  confirmed: [
    { to: "paid", label: "ob.markPaid", primary: true },
    { to: "cancelled", label: "ob.cancel" },
  ],
  paid: [],
  cancelled: [],
};

const PAST_SHOWN = 30;

export function OwnerBookings() {
  const { t, tr, locale } = useI18n();
  const [slug, setSlug] = useState<string | null>(null);
  const [spec, setSpec] = useState<SiteSpec | null>(null);
  const [bookings, setBookings] = useState<OwnerBooking[] | null>(null);
  const [failure, setFailure] = useState<BookingsFailure | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (target: string) => {
    setFailure(null);
    const [result, site] = await Promise.all([fetchOwnerBookings(target), fetchSite(target)]);
    if (site.status === "ok") setSpec(site.site.published ?? site.site.draft);
    if (!result.ok) {
      setFailure(result.reason);
      return;
    }
    setBookings(result.bookings);
  }, []);

  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get("salon");
    if (!target || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(target)) {
      window.location.replace("/owner");
      return;
    }
    setSlug(target);
    void load(target);
  }, [load]);

  const change = async (booking: OwnerBooking, to: OwnerBookingStatus) => {
    if (!slug || busy) return;
    if (to === "cancelled" && !window.confirm(t("ob.cancelConfirm"))) return;
    setBusy(booking.id);
    setNotice(null);
    const result = await setOwnerBookingStatus(slug, booking.id, to);
    setBusy(null);
    if (!result.ok) {
      setNotice(t(result.reason === "conflict" ? "ob.changedMeanwhile" : "o.requestFailed"));
    }
    // Reload either way: on a conflict the row has moved on without us.
    await load(slug);
  };

  const today = toIsoDate(new Date());
  const { upcoming, past } = useMemo(() => {
    const list = bookings ?? [];
    const key = (b: OwnerBooking) => `${b.booking_date} ${b.booking_time}`;
    return {
      upcoming: list.filter((b) => b.booking_date >= today).sort((a, b) => key(a).localeCompare(key(b))),
      past: list
        .filter((b) => b.booking_date < today)
        .sort((a, b) => key(b).localeCompare(key(a)))
        .slice(0, PAST_SHOWN),
    };
  }, [bookings, today]);

  const names = (b: OwnerBooking) => {
    const services = (spec?.items ?? []).filter((item) => b.service_ids.includes(item.id)).map((item) => tr(item.title));
    const master = spec?.staff.find((member) => member.id === b.master_id)?.name;
    return { services: services.join(", "), master };
  };

  const dayLabel = (iso: string) => {
    const date = fromIsoDate(iso);
    const [y, m, d] = iso.split("-");
    return `${formatWeekday(date, locale)}, ${d}.${m}${y === today.slice(0, 4) ? "" : `.${y}`}`;
  };

  const [filter, setFilter] = useState<OwnerBookingStatus | "all">("all");
  const [now] = useState(() => new Date());

  const live = (bookings ?? []).filter((b) => b.status !== "cancelled");
  const weekEnd = toIsoDate(new Date(now.getTime() + 7 * 864e5));
  const stats = [
    { label: t("ob.statToday"), value: String(live.filter((b) => b.booking_date === today).length) },
    { label: t("ob.upcoming"), value: String(upcoming.filter((b) => b.status !== "cancelled").length) },
    { label: t("ob.statPending"), value: String(upcoming.filter((b) => b.status === "pending").length), warn: true },
    {
      label: t("ob.statWeek"),
      value: formatSum(
        live.filter((b) => b.booking_date >= today && b.booking_date < weekEnd).reduce((sum, b) => sum + b.total_sum, 0),
        locale,
      ),
    },
  ];

  const counts = (status: OwnerBookingStatus) => upcoming.filter((b) => b.status === status).length;
  const shown = filter === "all" ? upcoming : upcoming.filter((b) => b.status === filter);

  const relative = (b: OwnerBooking) => {
    if (b.booking_date !== today) return null;
    const [h, m] = b.booking_time.split(":").map(Number);
    const minutes = h * 60 + m - (now.getHours() * 60 + now.getMinutes());
    if (minutes <= 0) return null;
    return minutes < 60
      ? t("ob.inMin", { n: minutes })
      : t("ob.inHours", { h: Math.floor(minutes / 60), m: minutes % 60 });
  };

  const edge: Record<OwnerBookingStatus, string> = {
    draft: "before:bg-hairline-strong",
    pending: "before:bg-saffron",
    confirmed: "before:bg-brand",
    paid: "before:bg-ink",
    cancelled: "before:bg-hairline-strong",
  };

  const card = (b: OwnerBooking) => {
    const { services, master } = names(b);
    const soon = relative(b);
    const date = fromIsoDate(b.booking_date);
    return (
      <li
        key={b.id}
        className={cx(
          "glaze relative flex flex-col gap-4 overflow-hidden rounded-sheet p-4 before:absolute before:inset-y-0 before:left-0 before:w-1 sm:flex-row sm:items-center sm:p-5 sm:pl-6",
          edge[b.status],
        )}
      >
        <div
          className={cx(
            "flex w-full flex-none flex-row items-center justify-between gap-2 rounded-card px-4 py-3 sm:w-28 sm:flex-col sm:justify-center sm:text-center",
            b.status === "pending" ? "bg-saffron/10" : "bg-brand-tint",
          )}
        >
          <span className={cx("text-[12px] font-semibold uppercase", b.status === "pending" ? "text-saffron" : "text-brand")}>
            {formatWeekday(date, locale)}, {date.getDate()} {formatDayMonth(date, locale).split(" ")[1]?.slice(0, 3)}
          </span>
          <span className="font-display text-[28px] leading-none font-semibold tabular-nums">{b.booking_time.slice(0, 5)}</span>
          {soon && <span className="text-[11px] font-semibold text-ink-muted">{soon}</span>}
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-[17px] font-semibold">{b.customer_name}</span>
            <StatusBadge status={b.status} locale={locale} />
          </p>
          {services && <p className="mt-1 text-[14px] leading-snug">{services}</p>}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-muted">
            {master && <span>{master}</span>}
            <span>{formatDuration(b.duration_min, locale)}</span>
            <span className="text-[15px] font-semibold text-brand tabular-nums">{formatSum(b.total_sum, locale)}</span>
          </p>
          <a
            href={`tel:${b.customer_phone}`}
            className="mt-3 inline-flex items-center gap-1.5 rounded-tile border border-hairline bg-surface px-3 py-1.5 text-[13px] font-semibold text-brand tabular-nums hover:border-hairline-strong"
          >
            <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 fill-current">
              <path d="M3.6 1.5c.4-.1.9.1 1.1.5l1.2 2.4c.2.4.1.9-.2 1.2l-.9.9a8.6 8.6 0 0 0 4.7 4.7l.9-.9c.3-.3.8-.4 1.2-.2l2.4 1.2c.4.2.6.7.5 1.1l-.4 1.7c-.1.5-.6.8-1.1.8C6.6 14.9 1.1 9.4 1.1 3c0-.5.3-1 .8-1.1z" />
            </svg>
            {b.customer_phone}
          </a>
        </div>

        {ACTIONS[b.status].length > 0 && (
          <div className="flex flex-none flex-row flex-wrap gap-2 sm:w-44 sm:flex-col">
            {ACTIONS[b.status].map((action) => (
              <Button
                key={action.to}
                size="sm"
                variant={action.primary ? "primary" : "secondary"}
                disabled={busy !== null}
                className="flex-1 py-2.5 text-[13px] sm:w-full"
                onClick={() => void change(b, action.to)}
              >
                {busy === b.id ? "…" : t(action.label)}
              </Button>
            ))}
          </div>
        )}
      </li>
    );
  };

  const pastRow = (b: OwnerBooking) => {
    const { services, master } = names(b);
    return (
      <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5 sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[14px]">
            <span className="font-semibold">{b.customer_name}</span>
            <span className="text-[12px] text-ink-muted tabular-nums">
              {dayLabel(b.booking_date)} · {b.booking_time.slice(0, 5)}
            </span>
            <StatusBadge status={b.status} locale={locale} />
          </p>
          <p className="mt-0.5 truncate text-[12px] text-ink-muted">
            {[services, master, formatDuration(b.duration_min, locale)].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className="text-[14px] font-semibold tabular-nums">{formatSum(b.total_sum, locale)}</span>
      </li>
    );
  };

  const chips: Array<{ key: OwnerBookingStatus | "all"; label: string; n: number; dot?: string }> = [
    { key: "all", label: t("ob.all"), n: upcoming.length },
    { key: "pending", label: statusLabel("pending", locale), n: counts("pending"), dot: "bg-saffron" },
    { key: "confirmed", label: statusLabel("confirmed", locale), n: counts("confirmed"), dot: "bg-brand" },
    { key: "paid", label: statusLabel("paid", locale), n: counts("paid"), dot: "bg-ink" },
    { key: "cancelled", label: statusLabel("cancelled", locale), n: counts("cancelled"), dot: "bg-ink-muted" },
  ];

  return (
    <AppShell active="bookings" slug={slug}>
      <section className="glaze flex flex-wrap items-center gap-4 rounded-sheet p-5 sm:p-6">
        <span aria-hidden className="h-10 w-1 flex-none rounded-full bg-brand" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.02em] sm:text-[26px]">
            {t("ob.title")}
            {spec?.name ? ` · ${spec.name}` : ""}
          </h1>
          <p className="mt-1 text-[13px] text-ink-muted">{t("ob.subtitle")}</p>
        </div>
        {slug && (
          <Button variant="secondary" size="sm" className="py-2.5 text-[13px]" onClick={() => void load(slug)}>
            {t("ob.refresh")}
          </Button>
        )}
      </section>

      {notice && (
        <p role="status" className="mt-4 rounded-card border border-saffron/40 bg-saffron/10 px-4 py-3 text-[14px]">
          {notice}
        </p>
      )}

      {failure ? (
        <div className="glaze mt-6 rounded-sheet p-6 text-[15px] leading-snug">
          <p>{t(FAILURE[failure])}</p>
          <div className="mt-4 flex gap-2">
            {failure === "not_signed_in" ? (
              <Link href="/owner" className="font-semibold text-brand">
                {t("o.ownerLogin")} →
              </Link>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => slug && void load(slug)}>
                {t("action.retry")}
              </Button>
            )}
          </div>
        </div>
      ) : bookings === null ? (
        <p role="status" className="mt-10 text-center text-[14px] text-ink-muted motion-safe:animate-pulse">
          {t("ob.loading")}
        </p>
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="glaze rounded-sheet p-4 sm:p-5">
                <dt className="text-[12px] font-semibold tracking-[0.04em] text-ink-muted uppercase">{stat.label}</dt>
                <dd
                  className={cx(
                    "mt-3 font-display text-[26px] leading-none font-semibold tabular-nums sm:text-[30px]",
                    stat.warn && stat.value !== "0" && "text-saffron",
                  )}
                >
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="rail mt-6 gap-2 pb-1">
            {chips.map((chip) => {
              const on = filter === chip.key;
              return (
                <button
                  key={chip.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilter(chip.key)}
                  className={cx(
                    "rail-item inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors duration-150",
                    on
                      ? "border-brand bg-brand text-brand-ink"
                      : "border-hairline bg-surface-raised text-ink hover:border-hairline-strong",
                  )}
                >
                  {chip.dot && <span aria-hidden className={cx("size-2 rounded-full", on ? "bg-brand-ink" : chip.dot)} />}
                  {chip.label}
                  <span
                    className={cx(
                      "rounded-full px-1.5 text-[11px] tabular-nums",
                      on ? "bg-white/20" : "bg-surface-sunken text-ink-muted",
                    )}
                  >
                    {chip.n}
                  </span>
                </button>
              );
            })}
          </div>

          <section className="mt-6">
            <h2 className="text-[18px] font-semibold tracking-[-0.01em]">
              {t("ob.upcoming")} · {shown.length}
            </h2>
            {shown.length === 0 ? (
              <div className="glaze mt-3 rounded-sheet px-6 py-10 text-center">
                <p className="text-[15px] font-semibold">
                  {filter === "all" ? t("ob.noneUpcoming") : t("ob.noneFilter")}
                </p>
                {filter === "all" && slug && (
                  <p className="mx-auto mt-2 max-w-[48ch] text-[13px] leading-relaxed text-ink-muted">{t("ob.shareHint")}</p>
                )}
              </div>
            ) : (
              <ul className="mt-3 space-y-3">{shown.map(card)}</ul>
            )}
          </section>

          {past.length > 0 && (
            <section className="mt-10">
              <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-ink-muted">{t("ob.past")}</h2>
              <ul className="glaze mt-3 divide-y divide-hairline rounded-sheet">{past.map(pastRow)}</ul>
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}
