"use client";

import { Stars } from "@/components/ui/Stars";
import { useBooking } from "@/lib/booking/store";
import { masters } from "@/lib/data/salon";
import { worksOn } from "@/lib/booking/slots";
import { toIsoDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { useTelegram } from "@/lib/telegram-provider";
import { cx } from "@/lib/cx";

export function MasterList({ onPicked }: { onPicked?: () => void } = {}) {
  const { draft, setMaster } = useBooking();
  const { t, tr } = useI18n();
  const { haptic } = useTelegram();

  const today = toIsoDate(new Date());
  const chosenServices = draft.serviceIds;

  const canDoAll = (serviceIds: string[]) =>
    chosenServices.every((id) => serviceIds.includes(id));

  const eligible = masters.filter((m) => canDoAll(m.serviceIds));

  return (
    <div className="space-y-2 px-5">
      {/* "First available" first: most customers want the soonest slot, not a
          particular person, and putting it last would bury it. */}
      <button
        type="button"
        aria-pressed={draft.masterId === "any"}
        onClick={() => {
          setMaster("any");
          haptic("select");
          onPicked?.();
        }}
        disabled={eligible.length === 0}
        className={cx(
          "flex w-full items-center gap-3 rounded-card border p-3.5 text-left transition-colors duration-150",
          draft.masterId === "any"
            ? "border-brand bg-brand/8"
            : "border-hairline bg-surface-raised",
          eligible.length === 0 && "opacity-45",
        )}
      >
        <span
          aria-hidden
          className="grid size-11 flex-none place-items-center rounded-full border border-dashed border-ink-muted/50 text-ink-muted"
        >
          <svg viewBox="0 0 20 20" fill="none" className="size-5 stroke-current">
            <circle cx="10" cy="10" r="7.2" strokeWidth="1.6" />
            <path d="M10 6.2v4l2.6 1.6" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{t("master.anyTitle")}</span>
          <span className="mt-0.5 block text-[13px] text-ink-muted">
            {t("master.anyHint")}
          </span>
        </span>
      </button>

      {masters.map((master) => {
        const able = canDoAll(master.serviceIds);
        const selected = draft.masterId === master.id;
        const worksToday = worksOn(master, today);

        return (
          <button
            key={master.id}
            type="button"
            aria-pressed={selected}
            disabled={!able}
            onClick={() => {
              setMaster(master.id);
              haptic("select");
              onPicked?.();
            }}
            className={cx(
              "flex w-full items-center gap-3 rounded-card border p-3.5 text-left transition-colors duration-150",
              selected ? "border-brand bg-brand/8" : "border-hairline bg-surface-raised",
              !able && "opacity-45",
            )}
          >
            <span
              aria-hidden
              className="grid size-11 flex-none place-items-center rounded-full font-display text-[17px] font-bold text-white"
              style={{ backgroundColor: master.tint }}
            >
              {master.name.charAt(0)}
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[15px] font-semibold">{master.name}</span>
                <Stars rating={master.rating} className="flex-none text-[13px]" />
              </span>
              <span className="mt-0.5 block truncate text-[13px] text-ink-muted">
                {tr(master.craft)}
              </span>
              <span
                className={cx(
                  "mt-1 block text-[12px] font-medium",
                  !able
                    ? "text-accent"
                    : worksToday
                      ? "text-brand"
                      : "text-ink-muted",
                )}
              >
                {!able
                  ? t("master.cannotDoAll")
                  : worksToday
                    ? t("master.worksToday")
                    : t("master.dayOff")}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
