"use client";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Stars } from "@/components/ui/Stars";
import { useCatalog } from "@/lib/booking/catalog";
import { formatPhone } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";

/**
 * The business's own header: a deep band in the theme's header colour with
 * the name, what the business is, today's hours and a call button. Flat, no
 * ornament (DESIGN.md).
 */
export function SalonHeader() {
  const { t, tr } = useI18n();
  const { salon, theme } = useCatalog();

  const tagline = tr(salon.tagline);
  const address = tr(salon.address);
  const initial = salon.name.trim().charAt(0).toUpperCase() || "V";

  return (
    <header className="text-white" style={{ backgroundColor: theme.header }}>
      <div className="px-5 pt-4 pb-5">
        <div className="flex items-center justify-between gap-3">
          {address ? (
            <span className="max-w-[60%] truncate rounded-tile bg-white/10 px-2.5 py-1 text-[12px] font-medium text-white/85">
              {address}
            </span>
          ) : (
            <span />
          )}
          <LanguageSwitcher />
        </div>

        <div className="mt-4 flex items-center gap-3.5">
          <span
            aria-hidden
            className="grid size-14 flex-none place-items-center rounded-card bg-white/12 font-display text-[24px] font-bold"
          >
            {initial}
          </span>
          <div className="min-w-0">
            <p className="font-display text-[22px] leading-[1.15] font-semibold tracking-[-0.02em] break-words">
              {salon.name}
            </p>
            {tagline && <p className="mt-0.5 text-[13px] leading-snug text-white/75">{tagline}</p>}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span className="flex items-center gap-2 text-[13px] text-white/85">
            <span aria-hidden className="size-2 rounded-full bg-[#7f9fff]" />
            {salon.reviewCount > 0
              ? t("salon.openToday", { time: salon.openTo })
              : t("site.hours", { from: salon.openFrom, to: salon.openTo })}
            {salon.reviewCount > 0 && (
              <span className="flex items-center gap-1.5 text-white/70">
                · <Stars rating={salon.rating} className="text-white" />
                {t("salon.reviews", { count: salon.reviewCount })}
              </span>
            )}
          </span>
          {salon.phone && (
            <a
              href={`tel:+${salon.phone}`}
              aria-label={formatPhone(salon.phone)}
              className="glaze-brand inline-flex items-center gap-1.5 rounded-tile px-3.5 py-2 text-[13px] font-semibold text-brand-ink"
            >
              <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 fill-current">
                <path d="M3.6 1.5c.4-.1.9.1 1.1.5l1.2 2.4c.2.4.1.9-.2 1.2l-.9.9a8.6 8.6 0 0 0 4.7 4.7l.9-.9c.3-.3.8-.4 1.2-.2l2.4 1.2c.4.2.6.7.5 1.1l-.4 1.7c-.1.5-.6.8-1.1.8C6.6 14.9 1.1 9.4 1.1 3c0-.5.3-1 .8-1.1z" />
              </svg>
              {formatPhone(salon.phone)}
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
