"use client";

import { useMemo } from "react";
import { useBooking } from "@/lib/booking/store";
import { buildSlots, groupByBlock, type BusySpan } from "@/lib/booking/slots";
import { useCatalog, useDraftTotal } from "@/lib/booking/catalog";
import { useI18n } from "@/lib/i18n/provider";
import { useTelegram } from "@/lib/telegram-provider";
import { cx } from "@/lib/cx";

/**
 * The time grid is a tile wall: a free slot is glazed and catches light, a
 * taken one is unglazed biscuit, and the chosen one is glazed in pomegranate.
 * This is the one loud element in the app, because picking a time is the whole
 * point of the screen.
 */
export function SlotGrid({
  onPicked,
  taken,
}: { onPicked?: () => void; taken?: BusySpan[] } = {}) {
  const { draft, setTime } = useBooking();
  const { masters } = useCatalog();
  const total = useDraftTotal();
  const { t } = useI18n();
  const { haptic } = useTelegram();

  const slots = useMemo(() => {
    if (!draft.date || !draft.masterId) return [];
    return buildSlots({
      masterId: draft.masterId,
      isoDate: draft.date,
      durationMin: total.minutes,
      masters,
      taken,
      candidates: masters.filter((m) => draft.serviceIds.every((id) => m.serviceIds.includes(id))),
    });
  }, [draft.date, draft.masterId, draft.serviceIds, total.minutes, masters, taken]);

  const blocks = groupByBlock(slots);
  const anyFree = slots.some((s) => s.available);

  if (!draft.date) return null;

  if (!anyFree) {
    return (
      <div className="mx-5 mt-4 rounded-card border border-hairline bg-surface-raised p-5 text-center">
        <p className="text-[14px] text-ink-muted">{t("time.noSlots")}</p>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-5">
      <h3 className="px-5 font-display text-[13px] font-semibold text-ink-muted">
        {t("time.pickSlot")}
      </h3>

      {blocks.map(({ block, slots: group }) => (
        <section key={block} className="px-5">
          <p className="text-[12px] font-medium text-ink-muted">{t(`time.${block}`)}</p>

          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {group.map((slot) => {
              const selected = draft.time === slot.time;
              return (
                <button
                  key={slot.time}
                  type="button"
                  disabled={!slot.available}
                  aria-pressed={selected}
                  aria-label={
                    slot.available ? slot.time : `${slot.time}, ${t("time.taken")}`
                  }
                  onClick={() => {
                    setTime(slot.time);
                    haptic("press");
                    onPicked?.();
                  }}
                  className={cx(
                    "relative rounded-tile py-2.5 text-[14px] font-semibold tabular-nums transition-[background-color,transform] duration-150",
                    selected
                      ? "glaze-accent text-white"
                      : slot.available
                        ? "glaze border border-hairline active:scale-[0.97]"
                        : "biscuit text-ink-muted/55",
                  )}
                >
                  {slot.time}
                  {!slot.available && slot.reason === "taken" && (
                    /* Struck through, the way a diary page looks. */
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-ink-muted/40"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
