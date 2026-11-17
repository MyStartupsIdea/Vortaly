"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
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

const BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") ?? "";

declare global {
  interface Window {
    __vortalyTelegramAuth?: (user: unknown) => void;
  }
}

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
  const widget = useRef<HTMLDivElement>(null);

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
          window.location.assign(`/builder/${result.slug}`);
          return;
        }
        setError(t(CLAIM_ERROR[result.reason]));
      } else {
        const next = safeNext();
        if (next && current.sites.some((site) => `/builder/${site.slug}` === next)) {
          window.location.assign(next);
          return;
        }
      }
      setView(current);
      setPhase("ready");
    },
    [t],
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

  // The widget is a script that draws an iframe where it is inserted.
  useEffect(() => {
    if (phase !== "signed_out" || !BOT || !widget.current) return;
    window.__vortalyTelegramAuth = (user) => void login({ widget: user });
    const host = widget.current;
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", BOT);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "12");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-onauth", "window.__vortalyTelegramAuth(user)");
    host.replaceChildren(script);
    return () => {
      host.replaceChildren();
    };
  }, [login, phase]);

  const logout = async () => {
    await signOut();
    setView(null);
    setPhase("signed_out");
  };

  const hasInvite = phase !== "loading" && typeof window !== "undefined" && Boolean(param("invite"));

  return (
    <div className="grid min-h-screen place-items-center bg-surface-sunken px-4 py-10">
      <div className="w-full max-w-[420px] rounded-card border border-hairline bg-surface p-6 shadow-[0_12px_40px_rgb(15_46_44/0.10)]">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-[13px] font-bold tracking-[-0.01em] text-ink-muted">Vortaly</p>
          <LanguageSwitcher />
        </div>

        {phase === "loading" || phase === "signing_in" || phase === "claiming" ? (
          <p role="status" className="mt-8 mb-4 text-center text-[14px] text-ink-muted">
            {phase === "claiming" ? t("o.claiming") : t("o.signingIn")}
          </p>
        ) : phase === "signed_out" ? (
          <>
            <h1 className="mt-5 font-display text-[22px] leading-tight font-bold tracking-[-0.02em]">
              {t("o.title")}
            </h1>
            <p className="mt-2 text-[14px] leading-snug text-ink-muted">
              {hasInvite ? t("o.inviteIntro") : t("o.intro")}
            </p>
            {BOT ? (
              <div ref={widget} className="mt-6 flex min-h-[48px] justify-center" />
            ) : (
              <p className="mt-6 text-[13px] text-accent">{t("o.notConfigured")}</p>
            )}
          </>
        ) : (
          <>
            <h1 className="mt-5 font-display text-[22px] leading-tight font-bold tracking-[-0.02em]">
              {view?.owner?.name ? t("o.hello", { name: view.owner.name }) : t("o.helloNoName")}
            </h1>
            {view && view.sites.length > 0 ? (
              <ul className="mt-5 space-y-2">
                {view.sites.map((site) => (
                  <li key={site.slug}>
                    <Link
                      href={`/builder/${site.slug}`}
                      className="flex items-center justify-between rounded-card border border-hairline bg-surface-raised px-4 py-3 hover:border-brand"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold">{site.name}</span>
                        <span className="block truncate font-mono text-[11px] text-ink-muted">/{site.slug}</span>
                      </span>
                      <span className="flex-none text-[13px] font-semibold text-brand">{t("o.open")} →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[14px] leading-snug text-ink-muted">{t("o.noSites")}</p>
            )}
            <Button variant="secondary" size="sm" className="mt-6" onClick={() => void logout()}>
              {t("o.logout")}
            </Button>
          </>
        )}

        {error && (
          <p role="status" className="mt-4 text-[13px] leading-snug text-accent">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
