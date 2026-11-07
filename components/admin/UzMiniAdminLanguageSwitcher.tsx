"use client";

import { LOCALE_NAMES } from "@/lib/i18n/dictionaries";
import { useLocale } from "@/lib/i18n/context";
import type { Locale } from "@/lib/types";
import { cx } from "@/lib/cx";

const ORDER: Locale[] = ["ru", "uz"];

/**
 * Inline RU / UZ toggle for the admin panel. Mirrors the Mini App
 * LanguageSwitcher vocabulary (rounded pill, two visible languages) but
 * styled a little more compact for a desktop toolbar.
 */
export function LANGUAGE_SWITCHER() {
  const { locale, setLocale } = useLocale();

  return (
    <div
      role="group"
      aria-label={locale === "ru" ? "Язык" : "Til"}
      className="inline-flex rounded-full border border-hairline bg-surface-sunken p-0.5"
    >
      {ORDER.map((code) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            aria-pressed={active}
            onClick={() => setLocale(code)}
            className={cx(
              "rounded-full px-3 py-1 text-[12px] font-semibold transition-colors duration-150",
              active
                ? "bg-surface-raised text-petrol shadow-[0_1px_2px_rgba(15,46,44,0.12)]"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {LOCALE_NAMES[code]}
          </button>
        );
      })}
    </div>
  );
}
