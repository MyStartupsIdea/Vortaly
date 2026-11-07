"use client";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Stars } from "@/components/ui/Stars";
import { salon } from "@/lib/data/salon";
import { formatPhone } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";

/**
 * A tiled dado, as on the wall of a Tashkent salon. Deterministic order, not
 * random, so the strip is identical on every render.
 */
const DADO = [
  "bg-turquoise",
  "bg-saffron",
  "bg-turquoise",
  "bg-pomegranate",
  "bg-turquoise",
  "bg-saffron",
  "bg-turquoise",
  "bg-pomegranate",
  "bg-turquoise",
  "bg-saffron",
  "bg-turquoise",
  "bg-pomegranate",
  "bg-turquoise",
  "bg-saffron",
] as const;

export function SalonHeader() {
  const { t, tr } = useI18n();

  return (
    <header className="bg-petrol text-porcelain">
      <div className="px-5 pt-5 pb-6">
        <div className="flex items-start justify-between gap-3">
          <p className="font-display text-[30px] leading-none font-bold tracking-[-0.03em]">
            {salon.name}
          </p>
          <LanguageSwitcher />
        </div>

        <p className="mt-3 max-w-[34ch] text-[14px] leading-snug text-porcelain/70">
          {tr(salon.tagline)}
        </p>

        <div className="mt-4 flex items-center gap-4 text-[13px]">
          <Stars rating={salon.rating} className="text-porcelain" />
          <span className="text-porcelain/60">
            {t("salon.reviews", { count: salon.reviewCount })}
          </span>
          <span className="text-porcelain/60">
            {t("salon.openToday", { time: salon.openTo })}
          </span>
        </div>

        <address className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] not-italic">
          <span className="max-w-[26ch] text-porcelain/70">{tr(salon.address)}</span>
          <a
            href={`tel:+${salon.phone}`}
            className="rounded-full border border-porcelain/25 px-3 py-1 font-semibold text-porcelain"
          >
            {formatPhone(salon.phone)}
          </a>
        </address>
      </div>

      {/* The dado: fourteen glazed tiles closing the header band. */}
      <div aria-hidden className="flex h-2.5 w-full">
        {DADO.map((tint, i) => (
          <span key={i} className={`${tint} h-full flex-1`} />
        ))}
      </div>
    </header>
  );
}
