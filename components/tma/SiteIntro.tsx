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
    <div className="border-b border-hairline">
      {about && (
        <p className="px-5 pt-5 text-[15px] leading-relaxed text-ink">{about}</p>
      )}

      {highlights.length > 0 && (
        <ul className="grid grid-cols-2 gap-1.5 px-5 pt-4">
          {highlights.map((text, i) => (
            <li
              key={i}
              className="glaze flex items-start gap-2 rounded-tile border border-hairline px-3 py-2.5 text-[13px] leading-snug font-semibold"
            >
              <span aria-hidden className="mt-[5px] size-1.5 flex-none rounded-full bg-brand" />
              <span className="min-w-0">{text}</span>
            </li>
          ))}
        </ul>
      )}

      {site.showcase.map((section, i) => (
        <section key={i} className="pt-5">
          <h2 className="px-5 font-display text-[13px] font-semibold tracking-[0.01em] text-ink-muted">
            {tr(section.title)}
          </h2>
          <ul className="mt-1">
            {section.items.map((item) => (
              <li
                key={item.id}
                className="mx-5 flex items-baseline justify-between gap-4 border-b border-hairline py-3 last:border-b-0"
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

      <div className="h-5" />
    </div>
  );
}
