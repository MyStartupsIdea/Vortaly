"use client";

import { useState } from "react";
import { useBooking } from "@/lib/booking/store";
import { useCatalog } from "@/lib/booking/catalog";
import { formatDuration, formatSum } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { useTelegram } from "@/lib/telegram-provider";
import { cx } from "@/lib/cx";

/** A group id, or "all". Group ids come from the tenant's own catalogue. */
type Filter = string;

export function ServiceList() {
  const { draft, toggleService } = useBooking();
  const { t, tr, locale } = useI18n();
  const { haptic } = useTelegram();
  const { services, groups } = useCatalog();
  const [chosen, setFilter] = useState<Filter>("all");

  // A group can disappear under the filter while a site is being edited.
  const filter = chosen === "all" || groups.some((g) => g.id === chosen) ? chosen : "all";
  const GROUP_ORDER = groups.map((g) => g.id);
  const groupTitle = (id: string) => {
    const group = groups.find((g) => g.id === id);
    return group ? tr(group.title) : "";
  };

  const visible = filter === "all" ? services : services.filter((s) => s.group === filter);

  // Grouped while browsing everything; a single flat list once filtered, since
  // one heading above one group is just noise.
  const sections =
    filter === "all"
      ? GROUP_ORDER.map((group) => ({
          group,
          items: visible.filter((s) => s.group === group),
        })).filter((g) => g.items.length > 0)
      : [{ group: filter, items: visible }];

  return (
    <div>
      {/* Category rail — swipeable, so five categories cost no vertical space. */}
      <div className={cx("rail gap-1.5 px-5 pb-1", groups.length < 2 && "hidden")}>
        {(["all", ...GROUP_ORDER] as Filter[]).map((option) => {
          const active = filter === option;
          const count =
            option === "all"
              ? draft.serviceIds.length
              : draft.serviceIds.filter(
                  (id) => services.find((s) => s.id === id)?.group === option,
                ).length;

          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setFilter(option);
                haptic("select");
              }}
              className={cx(
                "rail-item flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors duration-150",
                active
                  ? "glaze-brand text-brand-ink"
                  : "border border-hairline bg-surface-raised text-ink-muted",
              )}
            >
              {option === "all" ? t("cat.all") : groupTitle(option)}
              {count > 0 && (
                <span
                  className={cx(
                    "grid size-4 place-items-center rounded-full text-[10px] font-bold tabular-nums",
                    active ? "bg-brand-ink/25 text-brand-ink" : "bg-brand text-brand-ink",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 space-y-6">
        {sections.map(({ group, items }) => (
          <section key={group}>
            {filter === "all" && groups.length > 1 && (
              <h3 className="px-5 font-display text-[13px] font-semibold tracking-[0.01em] text-ink-muted">
                {groupTitle(group)}
              </h3>
            )}

            <ul className={filter === "all" ? "mt-2" : ""}>
              {items.map((service) => {
                const selected = draft.serviceIds.includes(service.id);
                return (
                  <li key={service.id}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        toggleService(service.id);
                        haptic("select");
                      }}
                      className={cx(
                        "flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors duration-150",
                        selected ? "bg-brand/8" : "bg-transparent",
                      )}
                    >
                      {/* A glazed tile is the checkbox — same vocabulary as the
                          time grid, so selection reads the same everywhere. */}
                      <span
                        aria-hidden
                        className={cx(
                          "grid size-6 flex-none place-items-center rounded-tile transition-colors duration-150",
                          selected
                            ? "glaze-brand text-brand-ink"
                            : "glaze border border-hairline",
                        )}
                      >
                        {selected && (
                          <svg
                            viewBox="0 0 14 14"
                            className="size-3.5 stroke-current"
                            fill="none"
                          >
                            <path
                              d="M2.5 7.5 5.5 10.5 11.5 3.5"
                              strokeWidth="2.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[15px] font-semibold">
                            {tr(service.title)}
                          </span>
                          {service.popular && (
                            <span
                              aria-label={t("home.popular")}
                              title={t("home.popular")}
                              className="size-1.5 flex-none rounded-full bg-saffron"
                            />
                          )}
                        </span>
                        <span className="mt-0.5 block text-[13px] text-ink-muted">
                          {formatDuration(service.durationMin, locale)}
                        </span>
                      </span>

                      <span className="flex-none text-[14px] font-semibold tabular-nums">
                        {service.priceSum > 0 ? formatSum(service.priceSum, locale) : t("site.free")}
                      </span>
                    </button>
                    <span className="mx-5 block border-b border-hairline last:hidden" />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
