"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { TELEGRAM_BOT, TelegramLogin } from "@/components/owner/TelegramLogin";
import { cx } from "@/lib/cx";
import { claim, fetchOwner, signIn, signOut, type OwnerView } from "@/lib/api/owner";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/dictionaries";

/**
 * The business owner's front door: sign in with Telegram, then open your
 * business in the builder.
 *
 *  - On the web: the official Telegram Login Widget. It only renders on the
 *    domain set for the bot with @BotFather (/setdomain).
 *  - Inside Telegram (opened from the bot): the Mini App's signed `initData`
 *    signs the owner in with no button at all.
 *  - `?invite=<code>`: after sign-in the invite is claimed and the owner lands
 *    straight in their builder.
 */

type Phase = "loading" | "signed_out" | "signing_in" | "claiming" | "ready";

const CLAIM_ERROR: Record<string, MessageKey> = {
  invalid: "o.inviteInvalid",
  expired: "o.inviteExpired",
  used: "o.inviteUsed",
  not_signed_in: "o.loginFailed",
  error: "o.requestFailed",
};

const LOGIN_ERROR: Record<string, MessageKey> = {
  invalid: "o.loginFailed",
  not_configured: "o.notConfigured",
  disabled: "o.notConfigured",
  error: "o.requestFailed",
};

function param(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

/** Only our own builder pages are valid places to return to after sign-in. */
function safeNext(): string | null {
  const next = param("next");
  return next && /^\/builder\/[a-z0-9-]+$/.test(next) ? next : null;
}

export function OwnerHome() {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>("loading");
  const [view, setView] = useState<OwnerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  /** Signed in: claim a pending invite, or go back where the owner came from. */
  const afterSignIn = useCallback(
    async (current: OwnerView) => {
      const invite = param("invite");
      if (invite) {
        setPhase("claiming");
        const result = await claim(invite);
        // The invite is spent either way; keep it out of history and reloads.
        window.history.replaceState(null, "", "/owner");
        if (result.ok) {
          router.push(`/builder/${result.slug}`);
          return;
        }
        setError(t(CLAIM_ERROR[result.reason]));
      } else {
        const next = safeNext();
        if (next && current.sites.some((site) => `/builder/${site.slug}` === next)) {
          router.push(next);
          return;
        }
      }
      setView(current);
      setPhase("ready");
    },
    [router, t],
  );

  const login = useCallback(
    async (credential: { widget: unknown } | { initData: string }) => {
      setPhase("signing_in");
      setError(null);
      const result = await signIn(credential);
      if (!result.ok) {
        setError(t(LOGIN_ERROR[result.reason]));
        setPhase("signed_out");
        return;
      }
      await afterSignIn(result.view);
    },
    [afterSignIn, t],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const current = await fetchOwner();
      if (cancelled) return;
      if (current?.owner) return afterSignIn(current);

      // Opened from the bot inside Telegram: the Mini App already proves who this is.
      const initData = window.Telegram?.WebApp?.initData;
      if (initData) return login({ initData });

      setPhase("signed_out");
    })();
    return () => {
      cancelled = true;
    };
  }, [afterSignIn, login]);

  const logout = async () => {
    await signOut();
    setView(null);
    setPhase("signed_out");
  };

  const hasInvite = phase !== "loading" && typeof window !== "undefined" && Boolean(param("invite"));

  const name = view?.owner?.name ?? null;
  const firstSlug = view?.sites[0]?.slug ?? null;

  if (phase !== "ready") {
    return (
      <AppShell sidebar={false}>
        <div className="mx-auto max-w-[460px] pt-6 sm:pt-12">
          {phase === "signed_out" ? (
            <section className="glaze rounded-sheet p-6 sm:p-8">
              <h1 className="text-[28px] leading-[1.15] font-semibold tracking-[-0.03em]">{t("o.title")}</h1>
              <p className="mt-3 text-[15px] leading-[1.55] text-ink-muted">
                {hasInvite ? t("o.inviteIntro") : t("o.intro")}
              </p>
              {TELEGRAM_BOT ? (
                <div className="mt-7">
                  <TelegramLogin onAuth={(user) => void login({ widget: user })} />
                </div>
              ) : (
                <p className="mt-7 text-[13px] text-accent">{t("o.notConfigured")}</p>
              )}
              <p className="mt-8 border-t border-hairline pt-5 text-[14px] text-ink-muted">
                {t("o.noAccountYet")}{" "}
                <Link href="/start" className="font-semibold text-brand hover:underline">
                  {t("s.newBusiness")} →
                </Link>
              </p>
            </section>
          ) : (
            <p role="status" className="py-16 text-center text-[14px] text-ink-muted motion-safe:animate-pulse">
              {phase === "claiming" ? t("o.claiming") : t("o.signingIn")}
            </p>
          )}
          {error && (
            <p role="status" className="mt-4 text-[14px] leading-snug font-medium text-accent">
              {error}
            </p>
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      active="businesses"
      slug={firstSlug}
      ownerName={name}
      footer={
        <button
          type="button"
          onClick={() => void logout()}
          className="w-full rounded-tile px-3 py-2.5 text-left text-[14px] font-medium text-ink-muted hover:bg-surface-sunken hover:text-ink"
        >
          {t("o.logout")}
        </button>
      }
    >
      <section className="glaze flex flex-wrap items-center gap-5 rounded-sheet p-6">
        <span
          aria-hidden
          className="grid size-16 flex-none place-items-center rounded-full bg-brand-tint font-display text-[26px] font-semibold text-brand"
        >
          {name?.trim().charAt(0).toUpperCase() || "V"}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.03em] sm:text-[30px]">
            {name ? t("o.hello", { name }) : t("o.helloNoName")}
          </h1>
          <p className="mt-1 text-[14px] text-ink-muted">{t("o.helloSub")}</p>
        </div>
        <Link
          href="/start"
          className="glaze-brand inline-flex items-center gap-2 rounded-tile px-5 py-3 text-[15px] font-semibold text-brand-ink hover:bg-brand-strong"
        >
          <span aria-hidden className="text-[18px] leading-none">+</span>
          {t("s.newBusiness")}
        </Link>
      </section>

      <section className="glaze mt-6 rounded-sheet p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-semibold tracking-[-0.02em]">{t("o.myBusinesses")}</h2>
            <p className="mt-0.5 text-[13px] text-ink-muted">{t("o.businessesSub")}</p>
          </div>
        </div>

        {view && view.sites.length > 0 ? (
          <ul className="mt-5 space-y-3">
            {view.sites.map((site) => (
              <li
                key={site.slug}
                className="flex flex-wrap items-center gap-4 rounded-card border border-hairline bg-surface p-4"
              >
                <span
                  aria-hidden
                  className="glaze-brand grid size-12 flex-none place-items-center rounded-card font-display text-[20px] font-semibold text-brand-ink"
                >
                  {site.name.trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[17px] font-semibold">{site.name}</span>
                    <span
                      className={cx(
                        "rounded-full px-2.5 py-0.5 text-[12px] font-semibold",
                        site.published ? "bg-brand-tint text-brand" : "bg-surface-sunken text-ink-muted",
                      )}
                    >
                      {site.published ? t("b.live") : t("b.neverPublished")}
                    </span>
                  </p>
                  <p className="mt-0.5 truncate text-[13px] text-ink-muted tabular-nums">/{site.slug}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-[14px] font-semibold">
                  {site.published && (
                    <Link
                      href={`/${site.slug}`}
                      target="_blank"
                      className="rounded-tile border border-hairline bg-surface-raised px-3.5 py-2 hover:border-hairline-strong"
                    >
                      {t("o.site")} ↗
                    </Link>
                  )}
                  <Link
                    href={`/owner/bookings?salon=${site.slug}`}
                    className="rounded-tile border border-hairline bg-surface-raised px-3.5 py-2 hover:border-hairline-strong"
                  >
                    {t("ob.open")}
                  </Link>
                  <Link
                    href={`/builder/${site.slug}`}
                    className="glaze-brand rounded-tile px-3.5 py-2 text-brand-ink hover:bg-brand-strong"
                  >
                    {t("o.open")} →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-5 rounded-card border border-dashed border-hairline-strong px-5 py-10 text-center">
            <p className="mx-auto max-w-[46ch] text-[14px] leading-relaxed text-ink-muted">{t("o.noSites")}</p>
            <Link
              href="/start"
              className="glaze-brand mt-5 inline-flex rounded-tile px-5 py-2.5 text-[14px] font-semibold text-brand-ink hover:bg-brand-strong"
            >
              {t("s.newBusiness")}
            </Link>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-sheet bg-navy p-6 text-white sm:p-7">
        <p className="text-[12px] font-semibold tracking-[0.08em] text-coral uppercase">{t("o.tgEyebrow")}</p>
        <h2 className="mt-2 text-[20px] font-semibold tracking-[-0.02em]">{t("o.tgTitle")}</h2>
        <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-white/75">{t("o.tgText")}</p>
      </section>

      {error && (
        <p role="status" className="mt-4 text-[14px] leading-snug font-medium text-accent">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void logout()}
        className="mt-8 text-[14px] font-medium text-ink-muted hover:text-ink lg:hidden"
      >
        {t("o.logout")}
      </button>
    </AppShell>
  );
}
