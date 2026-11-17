"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { TELEGRAM_BOT, TelegramLogin } from "@/components/owner/TelegramLogin";
import { TenantSite } from "@/components/tma/TenantSite";
import { VortalyLogo } from "@/components/ui/VortalyMark";
import { templateSpec } from "@/lib/builder/spec";
import { detectKind } from "@/lib/console/brief";
import { fetchOwner, signIn, startBusiness, type StartFailure } from "@/lib/api/owner";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { cx } from "@/lib/cx";

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

  const ready = name.trim().length >= 2 && phone.replace(/\D/g, "").length >= 9 && brief.trim().length >= 8;
  const field = (which: "name" | "phone" | "brief") =>
    cx(
      "w-full rounded-card border bg-surface-raised px-3.5 text-[15px] text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-muted/70 focus:border-lapis focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-lapis)_14%,transparent)]",
      badField === which ? "border-accent" : "border-hairline",
    );

  return (
    <div className="min-h-screen bg-surface px-4 pt-5 pb-12 sm:px-8">
      <header className="mx-auto flex w-full max-w-[1120px] items-center justify-between gap-3">
        <Link href="/owner" aria-label="Vortaly">
          <VortalyLogo />
        </Link>
        <LanguageSwitcher />
      </header>

      <div className="mx-auto mt-10 grid w-full max-w-[1120px] gap-14 sm:mt-16 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-20">
      <div className="w-full max-w-[540px]">
        <h1 className="text-[32px] leading-[1.08] font-semibold tracking-[-0.03em] text-balance sm:text-[44px]">
          {t("s.title")}
        </h1>
        <p className="mt-4 max-w-[46ch] text-[16px] leading-[1.5] text-ink-muted">{t("s.intro")}</p>

        <ol className="mt-6 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-ink-muted">
          {(["s.step1", "s.step2", "s.step3"] as const).map((key, i) => (
            <li key={key} className="flex items-center gap-2">
              <span className="grid size-5 place-items-center rounded-full border border-hairline text-[11px] font-semibold text-ink tabular-nums">
                {i + 1}
              </span>
              {t(key)}
            </li>
          ))}
        </ol>

        {phase === "building" ? (
          <div role="status" className="mt-8 rounded-card border border-hairline bg-surface p-6 text-center">
            <p className="font-display text-[17px] font-bold motion-safe:animate-pulse">{t("s.building")}</p>
            <p className="mt-2 text-[13px] text-ink-muted">{t("s.buildingHint")}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-[13px] font-semibold">{t("s.name")}</span>
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
              <span className="text-[13px] font-semibold">{t("s.phone")}</span>
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
              <span className="text-[13px] font-semibold">{t("s.brief")}</span>
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
              <p className="text-[12px] text-ink-muted">{t("s.examples")}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {EXAMPLES.map((example) => (
                  <button
                    key={example.label}
                    type="button"
                    onClick={() => setBrief(t(example.brief))}
                    className="rounded-full border border-hairline bg-surface-raised px-3 py-1.5 text-[12px] font-medium hover:border-brand"
                  >
                    {t(example.label)}
                  </button>
                ))}
              </div>
            </div>

            {phase === "sign_in" ? (
              <div className="rounded-card border border-brand/40 bg-brand/8 p-4">
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
              <Button type="submit" block disabled={!ready || phase === "checking"}>
                {t("s.build")}
              </Button>
            )}

            <p className="text-[12px] leading-snug text-ink-muted">{t("s.free")}</p>
          </form>
        )}

        {error && (
          <p role="status" className="mt-4 text-[13px] leading-snug text-accent">
            {error}
          </p>
        )}
      </div>

      <Preview name={name} brief={brief} />
      </div>
    </div>
  );
}

/**
 * What the owner is about to get, drawn with the real customer page and a
 * stock template for the trade their description points to. It is labelled
 * as an example: the AI writes the actual texts and prices.
 */
function Preview({ name, brief }: { name: string; brief: string }) {
  const { t } = useI18n();
  const deferredName = useDeferredValue(name);
  const deferredBrief = useDeferredValue(brief);
  const kind = detectKind(deferredBrief);
  const spec = useMemo(
    () =>
      templateSpec({
        slug: "preview",
        name: deferredName.trim() || t("s.previewName"),
        phone: "901234567",
        kind: kind === "custom" ? "salon" : kind,
      }),
    [deferredName, kind, t],
  );

  return (
    <aside aria-label={t("s.previewLabel")} className="hidden lg:block">
      <div className="sticky top-8">
        <div className="float h-[640px] overflow-hidden rounded-[28px] border border-hairline bg-surface [transform:translateZ(0)]">
          <div className="pointer-events-none h-full overflow-hidden select-none" inert>
            <TenantSite spec={spec} preview />
          </div>
        </div>
        <p className="mt-3 text-center text-[12px] text-ink-muted">{t("s.previewLabel")}</p>
      </div>
    </aside>
  );
}
