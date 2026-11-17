"use client";

import { LOCALE_NAMES } from "@/lib/i18n/dictionaries";
import { useLocale } from "@/lib/i18n/context";
import { useI18n } from "@/lib/i18n/provider";
import { useTelegram } from "@/lib/telegram-provider";
import type { Locale } from "@/lib/types";
import { cx } from "@/lib/cx";

const ORDER: Locale[] = ["ru", "uz"];

/**
 * Two languages, both always visible. A dropdown would hide the fact that
 * Uzbek exists, which is the opposite of what a Tashkent salon wants.
 */
export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const { t } = useI18n();
  const { haptic } = useTelegram();

  return (
    <div
      role="group"
      aria-label={t("lang.label")}
      className="inline-flex rounded-full border border-hairline bg-surface-sunken p-0.5"
    >
      {ORDER.map((code) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (active) return;
              setLocale(code);
              haptic("select");
            }}
            className={cx(
              "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors duration-150",
              active
                ? "bg-surface-raised text-brand shadow-[0_1px_3px_rgba(11,28,48,0.12)]"
                : "text-ink-muted",
            )}
          >
            {LOCALE_NAMES[code]}
          </button>
        );
      })}
    </div>
  );
}
