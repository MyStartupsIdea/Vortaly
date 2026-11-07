"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar } from "@/components/Calendar";
import { MasterList } from "@/components/MasterList";
import { SalonHeader } from "@/components/SalonHeader";
import { ServiceList } from "@/components/ServiceList";
import { SlotGrid } from "@/components/SlotGrid";
import { ActionBar } from "@/components/ui/ActionBar";
import { Button } from "@/components/ui/Button";
import { useBooking, type PayMethod } from "@/lib/booking/store";
import { createBooking, getBookings } from "@/lib/data/bookings";
import { getMaster, getService } from "@/lib/data/salon";
import { formatDayMonth, formatDuration, formatSum, fromIsoDate } from "@/lib/format";
import { useLocale } from "@/lib/i18n/context";
import { useI18n } from "@/lib/i18n/provider";
import { useTelegram } from "@/lib/telegram-provider";
import type { Booking } from "@/lib/types";
import { cx } from "@/lib/cx";

/* ----------------------------------------------------------------- phone --- */

/** Keep only the nine national digits: +998 is fixed in the field itself. */
function normalisePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("998")) digits = digits.slice(3);
  return digits.slice(0, 9);
}

/** 901234567 -> "90 123 45 67" */
function groupPhone(digits: string): string {
  return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)]
    .filter(Boolean)
    .join(" ");
}

/* --------------------------------------------------------------- section --- */

interface SectionProps {
  index: number;
  title: string;
  /** Shown in the collapsed header once the step has an answer. */
  answer: ReactNode;
  open: boolean;
  done: boolean;
  enabled: boolean;
  onToggle: () => void;
  children: ReactNode;
}

function Section({
  index,
  title,
  answer,
  open,
  done,
  enabled,
  onToggle,
  children,
}: SectionProps) {
  return (
    <section
      className={cx(
        "border-b border-hairline",
        open && "bg-surface-raised/40",
        !enabled && "opacity-45",
      )}
    >
      <h2>
        <button
          type="button"
          disabled={!enabled}
          aria-expanded={open}
          onClick={onToggle}
          className="flex w-full items-center gap-3 px-5 py-4 text-left"
        >
          {/* Numbered because booking really is a sequence, not decoration. */}
          <span
            aria-hidden
            className={cx(
              "grid size-7 flex-none place-items-center rounded-tile font-display text-[13px] font-bold tabular-nums",
              done
                ? "glaze-brand text-brand-ink"
                : open
                  ? "glaze border border-brand text-ink"
                  : "glaze border border-hairline text-ink-muted",
            )}
          >
            {done ? (
              <svg viewBox="0 0 14 14" className="size-3.5 stroke-current" fill="none">
                <path
                  d="M2.5 7.5 5.5 10.5 11.5 3.5"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              index
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span className="block font-display text-[15px] font-bold tracking-[-0.01em]">
              {title}
            </span>
            {!open && (
              <span className="mt-0.5 block truncate text-[13px] text-ink-muted">{answer}</span>
            )}
          </span>

          <svg
            aria-hidden
            viewBox="0 0 16 16"
            fill="none"
            className={cx(
              "size-4 flex-none stroke-ink-muted transition-transform duration-200",
              open && "rotate-90",
            )}
          >
            <path d="M6 3l5 5-5 5" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </h2>

      {open && <div className="pb-5">{children}</div>}
    </section>
  );
}

/* ------------------------------------------------------------------ page --- */

const PAY_OPTIONS: { value: PayMethod; labelKey: "pay.cash" | "pay.click" | "pay.payme" }[] = [
  { value: "cash", labelKey: "pay.cash" },
  { value: "click", labelKey: "pay.click" },
  { value: "payme", labelKey: "pay.payme" },
];

type StepIndex = 1 | 2 | 3 | 4;

export function MiniApp() {
  const router = useRouter();
  const { draft, total, setField, resetDraft, hydrated } = useBooking();
  const { locale } = useLocale();
  const { t, tr } = useI18n();
  const { user, haptic } = useTelegram();

  const [open, setOpen] = useState(1);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCount, setActiveCount] = useState(0);

  // Read after mount only: the booking store answers with a seed during SSR,
  // and putting that count in the static HTML would mismatch on hydration.
  useEffect(() => {
    if (!hydrated) return;
    setActiveCount(getBookings().filter((b) => b.status !== "cancelled").length);
  }, [hydrated]);

  // Telegram already knows who this is; asking again would be busywork.
  useEffect(() => {
    if (user?.first_name && !draft.name) setField("name", user.first_name);
  }, [user, draft.name, setField]);

  const phoneDigits = normalisePhone(draft.phone);
  const phoneValid = /^\d{9}$/.test(phoneDigits);
  const nameValid = draft.name.trim().length > 1;

  const done = useMemo<Record<StepIndex, boolean>>(
    () => ({
      1: draft.serviceIds.length > 0,
      2: draft.masterId !== null,
      3: Boolean(draft.date && draft.time),
      4: nameValid && phoneValid,
    }),
    [draft.serviceIds.length, draft.masterId, draft.date, draft.time, nameValid, phoneValid],
  );

  const ready = done[1] && done[2] && done[3] && done[4];
  const firstIncomplete: StepIndex = ([1, 2, 3, 4] as StepIndex[]).find((n) => !done[n]) ?? 4;

  /** A step opens only once every step before it has an answer. */
  const enabled = (index: number) =>
    ([1, 2, 3, 4] as StepIndex[]).filter((n) => n < index).every((n) => done[n]);

  const toggle = (index: number) => () => setOpen((current) => (current === index ? 0 : index));

  async function submit() {
    setError(null);
    setSending(true);
    haptic("press");

    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterId: draft.masterId,
          serviceIds: draft.serviceIds,
          date: draft.date,
          time: draft.time,
          customerName: draft.name.trim(),
          customerPhone: "+998" + phoneDigits,
          telegramUserId: user?.id,
        }),
      });

      if (!response.ok) throw new Error("HTTP " + response.status);

      const { booking } = (await response.json()) as { booking: Booking };

      // Into the shared store, so the slot just taken is blocked for everyone
      // and the booking appears under "my bookings".
      createBooking(booking);

      haptic("success");
      resetDraft();
      router.push(
        draft.payMethod === "cash"
          ? "/bookings?created=" + booking.id
          : "/checkout/" + booking.id + "?provider=" + draft.payMethod,
      );
    } catch {
      haptic("error");
      setError(t("error.generic"));
      setSending(false);
    }
  }

  const serviceAnswer =
    draft.serviceIds.length === 0
      ? t("tma.notChosen")
      : draft.serviceIds
          .map((id) => {
            const service = getService(id);
            return service ? tr(service.title) : null;
          })
          .filter(Boolean)
          .join(", ");

  const masterAnswer =
    draft.masterId === null
      ? t("tma.notChosen")
      : draft.masterId === "any"
        ? t("master.anyTitle")
        : (getMaster(draft.masterId)?.name ?? t("tma.notChosen"));

  const timeAnswer =
    draft.date && draft.time
      ? formatDayMonth(fromIsoDate(draft.date), locale) + ", " + draft.time
      : t("tma.notChosen");

  const contactAnswer = done[4]
    ? draft.name.trim() + ", +998 " + groupPhone(phoneDigits)
    : t("tma.notChosen");

  const payAnswer = t(PAY_OPTIONS.find((o) => o.value === draft.payMethod)!.labelKey);

  const actionLabel = ready
    ? sending
      ? t("confirm.sending")
      : t("confirm.submit")
    : firstIncomplete === 1
      ? t("error.pickService")
      : firstIncomplete === 2
        ? t("error.pickMaster")
        : firstIncomplete === 3
          ? t("error.pickTime")
          : t("tma.contacts");

  return (
    <main className="flex min-h-screen flex-col">
      <SalonHeader />

      {activeCount > 0 && (
        <Link
          href="/bookings"
          className="flex items-center justify-between gap-3 border-b border-hairline bg-surface-raised px-5 py-3 text-[14px]"
        >
          <span className="font-semibold">{t("nav.bookings")}</span>
          <span className="flex items-center gap-2 text-ink-muted">
            <span className="grid size-5 place-items-center rounded-full bg-brand text-[11px] font-bold text-brand-ink tabular-nums">
              {activeCount}
            </span>
            <svg viewBox="0 0 16 16" fill="none" className="size-4 stroke-current">
              <path d="M6 3l5 5-5 5" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
        </Link>
      )}

      <div className="flex-1">
        <Section
          index={1}
          title={t("step.services")}
          answer={serviceAnswer}
          open={open === 1}
          done={done[1]}
          enabled
          onToggle={toggle(1)}
        >
          <ServiceList />
        </Section>

        <Section
          index={2}
          title={t("step.master")}
          answer={masterAnswer}
          open={open === 2}
          done={done[2]}
          enabled={enabled(2)}
          onToggle={toggle(2)}
        >
          <MasterList onPicked={() => setOpen(3)} />
        </Section>

        <Section
          index={3}
          title={t("step.time")}
          answer={timeAnswer}
          open={open === 3}
          done={done[3]}
          enabled={enabled(3)}
          onToggle={toggle(3)}
        >
          <Calendar />
          <SlotGrid onPicked={() => setOpen(4)} />
        </Section>

        <Section
          index={4}
          title={t("tma.contacts")}
          answer={contactAnswer}
          open={open === 4}
          done={done[4]}
          enabled={enabled(4)}
          onToggle={toggle(4)}
        >
          <div className="space-y-4 px-5">
            <label className="block">
              <span className="block text-[13px] text-ink-muted">{t("confirm.name")}</span>
              <input
                value={draft.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder={t("confirm.namePlaceholder")}
                autoComplete="name"
                className="mt-1.5 w-full rounded-card border border-hairline bg-surface-raised px-4 py-3 text-[16px] outline-none placeholder:text-ink-muted/60 focus:border-brand"
              />
            </label>

            <label className="block">
              <span className="block text-[13px] text-ink-muted">{t("confirm.phone")}</span>
              {/* The country code is fixed rather than typed: every customer
                  here is on +998, and a prefix cannot be fat-fingered. */}
              <span className="mt-1.5 flex items-center rounded-card border border-hairline bg-surface-raised focus-within:border-brand">
                <span className="pl-4 text-[16px] font-semibold text-ink-muted tabular-nums">
                  +998
                </span>
                <input
                  value={groupPhone(phoneDigits)}
                  onChange={(e) => setField("phone", normalisePhone(e.target.value))}
                  placeholder="90 123 45 67"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  className="w-full bg-transparent px-3 py-3 text-[16px] tabular-nums outline-none placeholder:text-ink-muted/60"
                />
              </span>
              {phoneDigits.length > 0 && !phoneValid && (
                <span className="mt-1.5 block text-[12px] text-accent">{t("error.phone")}</span>
              )}
            </label>
          </div>
        </Section>

        <Section
          index={5}
          title={t("pay.method")}
          answer={payAnswer}
          done={ready}
          open={open === 5}
          enabled={enabled(5)}
          onToggle={toggle(5)}
        >
          <div className="grid grid-cols-3 gap-1.5 px-5">
            {PAY_OPTIONS.map((option) => {
              const active = draft.payMethod === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setField("payMethod", option.value);
                    haptic("select");
                  }}
                  className={cx(
                    "rounded-tile px-2 py-3 text-[13px] font-semibold transition-colors duration-150",
                    active ? "glaze-brand text-brand-ink" : "glaze border border-hairline",
                  )}
                >
                  {t(option.labelKey)}
                </button>
              );
            })}
          </div>
          <p className="mt-3 px-5 text-[12px] text-ink-muted">{t("pay.hint")}</p>
        </Section>

        {error && <p className="px-5 pt-4 text-[13px] text-accent">{error}</p>}
      </div>

      <ActionBar>
        {done[1] && (
          <div className="mb-2 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="text-ink-muted">
              {t("action.selected", { count: draft.serviceIds.length })}
            </span>
            <span className="font-semibold tabular-nums">
              {formatSum(total.sum, locale)}
              <span className="ml-2 font-normal text-ink-muted">
                {formatDuration(total.minutes, locale)}
              </span>
            </span>
          </div>
        )}

        <Button
          block
          disabled={sending}
          onClick={() => {
            if (ready) {
              submit();
              return;
            }
            // Jump to whatever is still missing instead of refusing silently.
            setOpen(firstIncomplete);
            haptic("press");
          }}
        >
          {actionLabel}
        </Button>
      </ActionBar>
    </main>
  );
}
