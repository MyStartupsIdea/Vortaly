import { cx } from "@/lib/cx";

/**
 * The Vortaly mark: a white V on a cobalt tile, its right arm finished by an
 * AI spark. The owner starts the thing, the AI completes it. Drawn on a 32
 * grid; app/icon.svg and public/logo*.svg carry the same geometry.
 */
export const MARK_V = "M9.5 10.5 16 22.5 19.6 15.8";
export const MARK_SPARK =
  "M23 5.2c.5 2.6 1.6 3.7 4.2 4.2-2.6.5-3.7 1.6-4.2 4.2-.5-2.6-1.6-3.7-4.2-4.2 2.6-.5 3.7-1.6 4.2-4.2z";

export function VortalyMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={cx("flex-none", className)}>
      <rect width="32" height="32" rx="9" fill="var(--color-brand, #1d4ed8)" />
      <path
        d={MARK_V}
        fill="none"
        stroke="#fff"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d={MARK_SPARK} fill="#fff" />
    </svg>
  );
}

/** Mark plus wordmark, for headers. */
export function VortalyLogo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <VortalyMark size={size} />
      <span className="font-display text-[19px] leading-none font-semibold tracking-[-0.03em] text-ink">
        Vortaly
      </span>
    </span>
  );
}
