"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { TELEGRAM_BOT, TelegramLogin } from "@/components/owner/TelegramLogin";
import { VortalyLogo } from "@/components/ui/VortalyMark";
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

  return (
    <div className="min-h-screen bg-surface px-4 pt-5 pb-12 sm:px-8">
      <header className="mx-auto flex w-full max-w-[640px] items-center justify-between gap-3">
        <Link href="/start" aria-label="Vortaly">
          <VortalyLogo />
        </Link>
        <LanguageSwitcher />
      </header>

      <main className="mx-auto mt-10 w-full max-w-[640px] sm:mt-14">
        {phase === "loading" || phase === "signing_in" || phase === "claiming" ? (
          <p role="status" className="py-16 text-center text-[14px] text-ink-muted motion-safe:animate-pulse">
            {phase === "claiming" ? t("o.claiming") : t("o.signingIn")}
          </p>
        ) : phase === "signed_out" ? (
          <section className="max-w-[440px]">
            <h1 className="text-[30px] leading-[1.1] font-semibold tracking-[-0.03em]">{t("o.title")}</h1>
            <p className="mt-3 text-[15px] leading-[1.5] text-ink-muted">
              {hasInvite ? t("o.inviteIntro") : t("o.intro")}
            </p>
            {TELEGRAM_BOT ? (
              <div className="mt-7 flex justify-start">
                <TelegramLogin onAuth={(user) => void login({ widget: user })} />
              </div>
            ) : (
              <p className="mt-7 text-[13px] text-accent">{t("o.notConfigured")}</p>
            )}
            <p className="mt-8 text-[14px] text-ink-muted">
              {t("o.noAccountYet")}{" "}
              <Link href="/start" className="font-semibold text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">
                {t("s.newBusiness")}
              </Link>
            </p>
          </section>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h1 className="text-[30px] leading-[1.1] font-semibold tracking-[-0.03em]">
                {view?.owner?.name ? t("o.hello", { name: view.owner.name }) : t("o.helloNoName")}
              </h1>
              <Link
                href="/start"
                className="glaze-brand rounded-card px-4 py-2.5 text-[14px] font-semibold text-brand-ink hover:opacity-90"
              >
                + {t("s.newBusiness")}
              </Link>
            </div>

            <h2 className="mt-10 text-[13px] font-medium text-ink-muted">{t("o.myBusinesses")}</h2>
            {view && view.sites.length > 0 ? (
              <ul className="mt-3 divide-y divide-hairline overflow-hidden rounded-card border border-hairline bg-surface-raised">
                {view.sites.map((site) => (
                  <li key={site.slug} className="px-4 py-4 sm:px-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[16px] font-semibold">{site.name}</span>
                      <span
                        className={cx(
                          "flex-none text-[12px] font-medium",
                          site.published ? "text-lapis" : "text-ink-muted",
                        )}
                      >
                        {site.published ? t("b.live") : t("b.neverPublished")}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[12px] text-ink-muted tabular-nums">/{site.slug}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-[13px] font-semibold">
                      <Link
                        href={`/builder/${site.slug}`}
                        className="rounded-tile bg-ink px-3 py-1.5 text-surface hover:opacity-90"
                      >
                        {t("o.open")}
                      </Link>
                      <Link
                        href={`/owner/bookings?salon=${site.slug}`}
                        className="rounded-tile border border-hairline px-3 py-1.5 hover:border-ink/30"
                      >
                        {t("ob.open")}
                      </Link>
                      {site.published && (
                        <Link
                          href={`/${site.slug}`}
                          target="_blank"
                          className="rounded-tile border border-hairline px-3 py-1.5 hover:border-ink/30"
                        >
                          {t("o.site")} ↗
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-card border border-dashed border-hairline px-5 py-8 text-[14px] leading-snug text-ink-muted">
                {t("o.noSites")}
              </p>
            )}

            <button
              type="button"
              onClick={() => void logout()}
              className="mt-10 text-[13px] font-medium text-ink-muted hover:text-ink"
            >
              {t("o.logout")}
            </button>
          </>
        )}

        {error && (
          <p role="status" className="mt-4 text-[13px] leading-snug text-accent">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
