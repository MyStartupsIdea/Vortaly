"use client";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Stars } from "@/components/ui/Stars";
import { useCatalog } from "@/lib/booking/catalog";
import { formatPhone } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";

/** Fourteen tiles: the theme's four-tile motif, repeated and cut to length. */
const DADO_LENGTH = 14;

/**
 * A tiled dado, as on the wall of a Tashkent salon. Deterministic order, not
 * random, so the strip is identical on every render. Colours come from the
 * tenant's theme, so each business gets its own band without its own markup.
 */
export function SalonHeader() {
  const { t, tr } = useI18n();
  const { salon, theme } = useCatalog();

  const tagline = tr(salon.tagline);
  const address = tr(salon.address);

  return (
    <header className="text-porcelain" style={{ backgroundColor: theme.header }}>
      <div className="px-5 pt-5 pb-6">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 font-display text-[30px] leading-[1.05] font-bold tracking-[-0.03em] break-words">
            {salon.name}
          </p>
          <LanguageSwitcher />
        </div>

        {tagline && (
          <p className="mt-3 max-w-[34ch] text-[14px] leading-snug text-porcelain/70">{tagline}</p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
          {/* Stars are shown only where reviews exist to back them. */}
          {salon.reviewCount > 0 && (
            <>
              <Stars rating={salon.rating} className="text-porcelain" />
              <span className="text-porcelain/60">
                {t("salon.reviews", { count: salon.reviewCount })}
              </span>
            </>
          )}
          <span className="text-porcelain/60">
            {salon.reviewCount > 0
              ? t("salon.openToday", { time: salon.openTo })
              : t("site.hours", { from: salon.openFrom, to: salon.openTo })}
          </span>
        </div>

        {(address || salon.phone) && (
          <address className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] not-italic">
            {address && <span className="max-w-[26ch] text-porcelain/70">{address}</span>}
            {salon.phone && (
              <a
                href={`tel:+${salon.phone}`}
                className="rounded-full border border-porcelain/25 px-3 py-1 font-semibold text-porcelain"
              >
                {formatPhone(salon.phone)}
              </a>
            )}
          </address>
        )}
      </div>

      <div aria-hidden className="flex h-2.5 w-full">
        {Array.from({ length: DADO_LENGTH }, (_, i) => (
          <span
            key={i}
            className="h-full flex-1"
            style={{ backgroundColor: theme.tiles[i % theme.tiles.length] }}
          />
        ))}
      </div>
    </header>
  );
}
