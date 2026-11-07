"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Fills the width of its container — used for the bottom action bar. */
  block?: boolean;
  children: ReactNode;
}

const BASE =
  "inline-flex items-center justify-center gap-2 font-semibold transition-[transform,opacity,background-color] duration-150 active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45";

const SIZES: Record<Size, string> = {
  sm: "text-[12px] px-2.5 py-1.5",
  md: "text-[15px] px-6 py-3.5",
};

/* Only the primary action is a pill. Everything else keeps the card radius, so
   shape signals importance instead of being uniform decoration. */
const VARIANTS: Record<Variant, string> = {
  primary: "glaze-brand text-brand-ink rounded-full",
  secondary:
    "rounded-card border border-hairline bg-surface-raised text-ink",
  ghost:
    "rounded-card text-ink-muted hover:text-ink",
};

export function Button({
  variant = "primary",
  size = "md",
  block,
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      className={cx(BASE, VARIANTS[variant], SIZES[size], block && "w-full", className)}
      {...rest}
    >
      {children}
    </button>
  );
}
