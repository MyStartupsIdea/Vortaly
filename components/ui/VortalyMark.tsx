import { cx } from "@/lib/cx";

/**
 * The Vortaly mark: an eight-point girih star, two squares turned 45° against
 * each other, in lapis. The one ornament in the product (DESIGN.md).
 */
export function VortalyMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      className={cx("flex-none text-lapis", className)}
    >
      <rect x="5" y="5" width="14" height="14" rx="1.5" fill="currentColor" />
      <rect x="5" y="5" width="14" height="14" rx="1.5" fill="currentColor" transform="rotate(45 12 12)" />
      <circle cx="12" cy="12" r="2.6" fill="var(--color-surface)" />
    </svg>
  );
}

/** Mark plus wordmark, for headers. */
export function VortalyLogo({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <VortalyMark />
      <span className="text-[16px] font-semibold tracking-[-0.02em] text-ink">Vortaly</span>
    </span>
  );
}
