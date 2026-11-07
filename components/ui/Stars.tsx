import { cx } from "@/lib/cx";

/** Rating readout. The number does the work; the mark is a single saffron star. */
export function Stars({
  rating,
  className,
}: {
  rating: number;
  className?: string;
}) {
  return (
    <span className={cx("inline-flex items-baseline gap-1", className)}>
      <svg viewBox="0 0 12 12" aria-hidden className="size-3 self-center fill-saffron">
        <path d="M6 0.5 7.6 4.1l3.9.4-2.9 2.6.8 3.9L6 9.5l-3.4 1.5.8-3.9L0.5 4.5l3.9-.4z" />
      </svg>
      <span className="font-semibold tabular-nums">{rating.toFixed(1)}</span>
    </span>
  );
}
