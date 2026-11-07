"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import type { Translated } from "@/lib/types";
import { STORAGE_KEY, useLocale } from "./context";
import { dictionaries, type MessageKey } from "./dictionaries";

interface I18nValue {
  /** Mirrors useLocale().locale — the single source of truth. */
  locale: ReturnType<typeof useLocale>["locale"];
  /** t("step.of", { current: 2, total: 4 }) */
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  /** Pick the current language out of a { ru, uz } field. */
  tr: (field: Translated) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * Translation layer on top of LocaleProvider.
 *
 * LocaleProvider owns which language is active and persists it; this provider
 * only turns that choice into strings, so there is one piece of locale state in
 * the app rather than two that can drift apart.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const { locale, setLocale, isHydrated } = useLocale();

  // On a first visit with nothing stored, follow the language Telegram reports
  // for the user. An explicit choice is never overridden.
  useEffect(() => {
    if (!isHydrated) return;
    try {
      if (window.localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      return;
    }
    const fromTelegram = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
    if (fromTelegram?.startsWith("uz")) setLocale("uz");
  }, [isHydrated, setLocale]);

  const value = useMemo<I18nValue>(() => {
    const table = dictionaries[locale];
    return {
      locale,
      t: (key, vars) => {
        const template = table[key] ?? key;
        if (!vars) return template;
        return template.replace(/\{(\w+)\}/g, (_, name: string) =>
          String(vars[name] ?? `{${name}}`),
        );
      },
      tr: (field) => field[locale],
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
