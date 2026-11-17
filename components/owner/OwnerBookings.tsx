"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/admin/BookingBadges";
import { Button } from "@/components/ui/Button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { fetchSite } from "@/lib/api/builder";
import {
  fetchOwnerBookings,
  setOwnerBookingStatus,
  type BookingsFailure,
  type OwnerBooking,
  type OwnerBookingStatus,
} from "@/lib/api/owner";
import type { SiteSpec } from "@/lib/builder/spec";
import { formatDuration, formatSum, formatWeekday, fromIsoDate, toIsoDate } from "@/lib/format";
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

  const row = (b: OwnerBooking, withActions: boolean) => {
    const { services, master } = names(b);
    return (
      <li key={b.id} className="rounded-card border border-hairline bg-surface-raised px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-[15px] font-bold tabular-nums">
              {dayLabel(b.booking_date)} · {b.booking_time.slice(0, 5)}
            </p>
            {services && <p className="mt-0.5 text-[13px] leading-snug">{services}</p>}
            <p className="mt-0.5 text-[12px] text-ink-muted">
              {[master, formatDuration(b.duration_min, locale), formatSum(b.total_sum, locale)].filter(Boolean).join(" · ")}
            </p>
          </div>
          <StatusBadge status={b.status} locale={locale} />
        </div>
        <p className="mt-2 text-[13px]">
          {b.customer_name} ·{" "}
          <a href={`tel:${b.customer_phone}`} className="font-semibold text-brand">
            {b.customer_phone}
          </a>
        </p>
        {withActions && ACTIONS[b.status].length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {ACTIONS[b.status].map((action) => (
              <Button
                key={action.to}
                size="sm"
                variant={action.primary ? "primary" : "secondary"}
                disabled={busy !== null}
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

  return (
    <div className="min-h-screen bg-surface-sunken px-4 py-6">
      <div className="mx-auto w-full max-w-[560px]">
        <div className="flex items-center justify-between gap-3">
          <Link href="/owner" className="text-[12px] font-semibold text-ink-muted hover:text-ink">
            ← {t("o.myBusinesses")}
          </Link>
          <LanguageSwitcher />
        </div>

        <h1 className="mt-4 font-display text-[22px] leading-tight font-bold tracking-[-0.02em]">
          {t("ob.title")}
          {spec?.name ? <span className="text-ink-muted"> · {spec.name}</span> : null}
        </h1>

        {notice && (
          <p role="status" className="mt-3 rounded-card border border-saffron/40 bg-saffron/10 px-3 py-2 text-[13px]">
            {notice}
          </p>
        )}

        {failure ? (
          <div className="mt-6 rounded-card border border-hairline bg-surface p-5 text-[14px] leading-snug">
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
          <p role="status" className="mt-8 text-center text-[14px] text-ink-muted">
            {t("ob.loading")}
          </p>
        ) : (
          <>
            <section className="mt-6">
              <h2 className="text-[12px] font-semibold tracking-wide text-ink-muted uppercase">
                {t("ob.upcoming")} · {upcoming.length}
              </h2>
              {upcoming.length === 0 ? (
                <p className="mt-2 text-[14px] text-ink-muted">{t("ob.noneUpcoming")}</p>
              ) : (
                <ul className="mt-2 space-y-2">{upcoming.map((b) => row(b, true))}</ul>
              )}
            </section>

            {past.length > 0 && (
              <section className="mt-8">
                <h2 className="text-[12px] font-semibold tracking-wide text-ink-muted uppercase">{t("ob.past")}</h2>
                <ul className="mt-2 space-y-2 opacity-80">{past.map((b) => row(b, false))}</ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
