"use client";

import {
  SAVE_STATE_DOT,
  SAVE_STATE_HINT_KEY,
  SAVE_STATE_KEY,
  SAVE_STATE_TONE,
  type SaveState,
} from "@/lib/save-state";
import { useI18n } from "@/lib/i18n/provider";
import { cx } from "@/lib/cx";

/**
 * States the save badge in one place so the console, the booking list and the
 * admin table cannot drift into three different ways of saying "not saved".
 *
 * `pill` is the full statement for an outcome screen; `dot` is the compact
 * form for a table row or a list item, where the label still carries the words
 * rather than relying on colour alone.
 */
export function SaveBadge({
  state,
  variant = "pill",
  className,
}: {
  state: SaveState;
  variant?: "pill" | "dot";
  className?: string;
}) {
  const { t } = useI18n();
  const label = t(SAVE_STATE_KEY[state]);

  if (variant === "dot") {
    return (
      <span className={cx("inline-flex items-center gap-1.5", className)}>
        <span
          aria-hidden
          className={cx("size-1.5 flex-none rounded-full", SAVE_STATE_DOT[state])}
        />
        <span className="text-[11px] font-medium text-ink-muted">{label}</span>
      </span>
    );
  }

  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] font-semibold",
        SAVE_STATE_TONE[state],
        className,
      )}
    >
      <span aria-hidden className={cx("size-1.5 rounded-full", SAVE_STATE_DOT[state])} />
      {label}
    </span>
  );
}

/**
 * The badge plus its explanation and, when the server sent one, the raw
 * warning. The warning is shown verbatim in mono: it is operator-facing
 * diagnostic text, so translating or prettifying it would make it harder to
 * paste into a bug report.
 */
export function SaveNotice({
  state,
  warning,
  className,
}: {
  state: SaveState;
  warning?: string;
  className?: string;
}) {
  const { t } = useI18n();

  return (
    <div
      className={cx(
        "rounded-card border p-3",
        SAVE_STATE_TONE[state],
        className,
      )}
    >
      <p className="font-display text-[13px] font-bold">{t(SAVE_STATE_KEY[state])}</p>
      <p className="mt-1 text-[12px] leading-snug text-ink">
        {t(SAVE_STATE_HINT_KEY[state])}
      </p>
      {warning && (
        <p className="mt-2 font-mono text-[10px] leading-snug break-words text-ink-muted">
          {warning}
        </p>
      )}
    </div>
  );
}
