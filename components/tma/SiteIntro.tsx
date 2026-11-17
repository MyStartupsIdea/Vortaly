"use client";

import { useCatalog } from "@/lib/booking/catalog";
import { formatSum } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";

/**
 * The part of a generated site that is read rather than booked: what the
 * business is, why to choose it, and anything it sells without a reservation
 * (a cafe's menu). Renders nothing for the built-in module, which has no such
 * content.
 */
export function SiteIntro() {
  const { site } = useCatalog();
  const { tr, locale } = useI18n();

  if (!site) return null;

  const about = tr(site.about);
  const highlights = site.highlights.map((entry) => tr(entry)).filter(Boolean);

  if (!about && highlights.length === 0 && site.showcase.length === 0) return null;

  return (
    <div>
      {about && (
        <p className="px-5 pt-5 text-[15px] leading-relaxed text-ink">{about}</p>
      )}

      {highlights.length > 0 && (
        <ul className="flex flex-wrap gap-2 px-5 pt-4">
          {highlights.map((text, i) => (
            <li
              key={i}
              className="glaze flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] leading-snug font-medium"
            >
              <span aria-hidden className="size-1.5 flex-none rounded-full bg-brand" />
              <span className="min-w-0">{text}</span>
            </li>
          ))}
        </ul>
      )}

      {site.showcase.map((section, i) => (
        <section key={i} className="pt-5">
          <h2 className="px-5 font-display text-[16px] font-semibold">
            {tr(section.title)}
          </h2>
          <ul className="glaze mx-4 mt-2 rounded-card px-4">
            {section.items.map((item) => (
              <li
                key={item.id}
                className="flex items-baseline justify-between gap-4 border-b border-hairline py-3 last:border-b-0"
              >
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold">{tr(item.title)}</span>
                  {item.description && tr(item.description) && (
                    <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted">
                      {tr(item.description)}
                    </span>
                  )}
                </span>
                {item.priceSum > 0 && (
                  <span className="flex-none text-[14px] font-semibold tabular-nums">
                    {formatSum(item.priceSum, locale)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="h-2" />
    </div>
  );
}
