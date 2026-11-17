"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useState, type FormEvent } from "react";
import { templateSpec } from "@/lib/builder/spec";
import { formatSum } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { TELEGRAM_BOT, TelegramLogin } from "@/components/owner/TelegramLogin";
import { VortalyLogo } from "@/components/ui/VortalyMark";
import { detectKind } from "@/lib/console/brief";
import { fetchOwner, signIn, startBusiness, type StartFailure } from "@/lib/api/owner";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { cx } from "@/lib/cx";
import type { ProjectKind } from "@/lib/data/projects";

/**
 * The front door of the product: a business owner describes their business in
 * their own words, signs in with Telegram, and lands in the builder with a
 * site the AI has just written. No operator, no password, no API key.
 *
 * Signing in is asked for only after the description is written, so the
 * owner has already invested in the result when Telegram shows up. Inside
 * Telegram the Mini App's initData signs them in silently.
 */

const EXAMPLES: Array<{ label: MessageKey; brief: MessageKey }> = [
  { label: "s.exSalon", brief: "s.exSalonBrief" },
  { label: "s.exCafe", brief: "s.exCafeBrief" },
  { label: "s.exCarwash", brief: "s.exCarwashBrief" },
  { label: "s.exCourses", brief: "s.exCoursesBrief" },
];

const FAILURE: Record<StartFailure["reason"], MessageKey> = {
  invalid: "s.errInvalid",
  not_signed_in: "o.loginFailed",
  limit_reached: "s.errLimit",
  too_fast: "s.errTooFast",
  unavailable: "s.errUnavailable",
  error: "o.requestFailed",
};

const FIELD_ERROR: Record<"name" | "phone" | "brief", MessageKey> = {
  name: "s.errName",
  phone: "s.errPhone",
  brief: "s.errBrief",
};

type Phase = "checking" | "form" | "sign_in" | "building";

export function StartBusiness() {
  const { t } = useI18n();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [signedIn, setSignedIn] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [brief, setBrief] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [badField, setBadField] = useState<"name" | "phone" | "brief" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const current = await fetchOwner();
      if (cancelled) return;
      if (current?.owner) {
        setSignedIn(true);
      } else {
        const initData = window.Telegram?.WebApp?.initData;
        if (initData && (await signIn({ initData })).ok && !cancelled) setSignedIn(true);
      }
      if (!cancelled) setPhase("form");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const build = useCallback(async () => {
    setPhase("building");
    setError(null);
    setBadField(null);
    const result = await startBusiness({ name, phone, brief });
    if (result.ok) {
      router.push(`/builder/${result.slug}`);
      return;
    }
    if (result.reason === "not_signed_in") {
      setSignedIn(false);
      setPhase("sign_in");
      return;
    }
    if (result.reason === "invalid" && result.field) {
      setBadField(result.field);
      setError(t(FIELD_ERROR[result.field]));
    } else {
      setError(t(FAILURE[result.reason]));
    }
    setPhase("form");
  }, [brief, name, phone, router, t]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (phase !== "form") return;
    // The button stays live; a grey slab reads as broken. Say what is missing instead.
    const missing =
      name.trim().length < 2
        ? "name"
        : phone.replace(/\D/g, "").length !== 9
          ? "phone"
          : brief.trim().length < 8
            ? "brief"
            : null;
    if (missing) {
      setBadField(missing);
      setError(t(FIELD_ERROR[missing]));
      return;
    }
    setBadField(null);
    setError(null);
    if (signedIn) void build();
    else setPhase("sign_in");
  };

  const onTelegram = async (user: unknown) => {
    const result = await signIn({ widget: user });
    if (!result.ok) {
      setError(t("o.loginFailed"));
      return;
    }
    setSignedIn(true);
    void build();
  };

  const field = (which: "name" | "phone" | "brief") =>
    cx(
      "w-full rounded-card border bg-surface px-4 text-[15px] text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-muted/80 focus:border-lapis focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-lapis)_14%,transparent)]",
      badField === which ? "border-accent" : "border-hairline",
    );

  return (
    <div className="min-h-screen bg-surface-raised lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      <div className="px-5 pt-6 pb-14 sm:px-10 lg:px-16 lg:pt-8">
      <header className="flex w-full max-w-[560px] items-center justify-between gap-3">
        <Link href="/owner" aria-label="Vortaly">
          <VortalyLogo />
        </Link>
        <LanguageSwitcher />
      </header>

      <div className="mt-14 w-full max-w-[560px] sm:mt-20">
        <h1 className="text-[36px] leading-[1.02] font-semibold tracking-[-0.035em] text-balance sm:text-[52px]">
          {t("s.title")}
        </h1>
        <p className="mt-5 max-w-[44ch] text-[17px] leading-[1.5] text-ink">{t("s.intro")}</p>

        {phase === "building" ? (
          <div role="status" className="mt-10 rounded-card bg-surface-sunken p-8 text-center">
            <p className="font-display text-[17px] font-bold motion-safe:animate-pulse">{t("s.building")}</p>
            <p className="mt-2 text-[13px] text-ink-muted">{t("s.buildingHint")}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-10 space-y-5">
            <label className="block">
              <span className="text-[14px] font-semibold">{t("s.name")}</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                autoComplete="organization"
                placeholder={t("s.namePlaceholder")}
                className={cx(field("name"), "mt-1.5 h-12")}
              />
            </label>

            <label className="block">
              <span className="text-[14px] font-semibold">{t("s.phone")}</span>
              <span className="relative mt-1.5 block">
                <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[15px] text-ink-muted tabular-nums">
                  +998
                </span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^\d\s-]/g, ""))}
                  inputMode="tel"
                  autoComplete="tel-national"
                  maxLength={14}
                  placeholder="90 123 45 67"
                  className={cx(field("phone"), "h-12 pl-[3.6rem] tabular-nums")}
                />
              </span>
            </label>

            <label className="block">
              <span className="text-[14px] font-semibold">{t("s.brief")}</span>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={5}
                maxLength={1500}
                placeholder={t("s.briefPlaceholder")}
                className={cx(field("brief"), "mt-1.5 py-2.5 leading-snug")}
              />
            </label>

            <div>
              <p className="text-[13px] text-ink-muted">{t("s.examples")}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {EXAMPLES.map((example) => (
                  <button
                    key={example.label}
                    type="button"
                    onClick={() => setBrief(t(example.brief))}
                    className="rounded-full bg-surface-sunken px-3.5 py-2 text-[13px] font-medium text-ink transition-colors duration-150 hover:bg-brand hover:text-brand-ink"
                  >
                    {t(example.label)}
                  </button>
                ))}
              </div>
            </div>

            {phase === "sign_in" ? (
              <div className="rounded-card bg-surface-sunken p-5">
                <p className="text-[14px] font-semibold">{t("s.signInStep")}</p>
                <p className="mt-1 text-[13px] text-ink-muted">{t("s.signInWhy")}</p>
                <div className="mt-3">
                  {TELEGRAM_BOT ? (
                    <TelegramLogin onAuth={(user) => void onTelegram(user)} />
                  ) : (
                    <p className="text-[13px] text-accent">{t("o.notConfigured")}</p>
                  )}
                </div>
              </div>
            ) : (
              <Button type="submit" block disabled={phase === "checking"}>
                {t("s.build")}
              </Button>
            )}

            <p className="text-[13px] leading-snug text-ink-muted">{t("s.free")}</p>
          </form>
        )}

        {error && (
          <p role="status" className="mt-4 text-[14px] font-medium leading-snug text-accent">
            {error}
          </p>
        )}
      </div>
      </div>

      <Preview name={name} phone={phone} brief={brief} />
    </div>
  );
}

/**
 * What the owner is about to get, as a quiet schematic in Vortaly's own ink:
 * their name, the trade read from the description, and the shape of the app
 * (services, a time grid, a booking button). Texts and prices are drawn as
 * blank lines on purpose: the AI writes them from the description, and an
 * example must never show claims the owner did not make.
 */
const KIND_LABEL: Record<ProjectKind, MessageKey> = {
  salon: "tpl.salon",
  cafe: "tpl.cafe",
  carwash: "tpl.carwash",
  custom: "s.pvKind",
};

const SLOTS = ["10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30"];
const TAKEN = new Set([1, 4]);
const PICKED = 2;

/**
 * On a full field of lapis: the owner's name, the trade read from the
 * description, that trade's sample services with prices (the AI replaces them
 * from the description), a time grid and the booking button. No praise or
 * claims, so the example never says what the owner did not.
 */
function Preview({ name, phone, brief }: { name: string; phone: string; brief: string }) {
  const { t, locale } = useI18n();
  const shownName = useDeferredValue(name).trim() || t("s.previewName");
  const detected = detectKind(useDeferredValue(brief));
  const kind = detected === "custom" ? "salon" : detected;
  const digits = phone.replace(/\D/g, "");
  const items = useMemo(
    () =>
      templateSpec({ slug: "preview", name: "-", phone: "901234567", kind })
        .items.filter((item) => item.priceSum > 0)
        .slice(0, 3),
    [kind],
  );

  return (
    <aside
      aria-label={t("s.previewLabel")}
      className="hidden bg-brand text-brand-ink lg:flex lg:min-h-screen lg:flex-col lg:items-center lg:justify-center lg:px-12 lg:py-16"
    >
      <div className="w-full max-w-[340px] rounded-[32px] bg-white/15 p-2.5" aria-hidden>
        <div className="overflow-hidden rounded-[24px] bg-surface-raised text-ink">
          <div className="px-5 pt-6 pb-4">
            <p className="text-[12px] font-medium text-ink-muted">{t(KIND_LABEL[detected])}</p>
            <p className="mt-1 line-clamp-2 text-[24px] leading-[1.1] font-semibold tracking-[-0.02em] break-words">
              {shownName}
            </p>
            <p className="mt-1.5 text-[13px] text-ink-muted tabular-nums">
              +998 {digits ? phone.trim() : "90 123 45 67"}
            </p>
          </div>

          <div className="px-3">
            <p className="px-2 pb-2 text-[13px] font-semibold">{t("s.pvServices")}</p>
            <ul className="space-y-1">
              {items.map((item) => (
                <li key={item.id} className="flex items-baseline justify-between gap-4 rounded-tile bg-surface px-3 py-2.5">
                  <span className="truncate text-[13px] font-medium">{item.title[locale]}</span>
                  <span className="flex-none text-[12px] text-ink-muted tabular-nums">{formatSum(item.priceSum, locale)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="px-3 pt-4">
            <p className="px-2 pb-2 text-[13px] font-semibold">{t("s.pvToday")}</p>
            <div className="grid grid-cols-4 gap-1">
              {SLOTS.map((slot, i) => (
                <span
                  key={slot}
                  className={cx(
                    "rounded-tile py-2 text-center text-[12px] font-medium tabular-nums",
                    i === PICKED
                      ? "bg-brand text-brand-ink"
                      : TAKEN.has(i)
                        ? "text-ink-muted/70 line-through"
                        : "bg-surface",
                  )}
                >
                  {slot}
                </span>
              ))}
            </div>
          </div>

          <div className="p-3 pt-4">
            <span className="block rounded-full bg-brand py-3 text-center text-[14px] font-semibold text-brand-ink">
              {t("s.pvBook")}
            </span>
          </div>
        </div>
      </div>
      <p className="mt-6 max-w-[34ch] text-center text-[14px] leading-snug text-brand-ink/90">{t("s.previewLabel")}</p>
    </aside>
  );
}
