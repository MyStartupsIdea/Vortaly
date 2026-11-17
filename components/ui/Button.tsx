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
  md: "text-[15px] px-5 py-3.5",
};

/* One radius for every button; weight comes from fill, not shape. */
const VARIANTS: Record<Variant, string> = {
  primary: "glaze-brand text-brand-ink rounded-full hover:brightness-110",
  secondary:
    "rounded-full bg-surface-sunken text-ink hover:bg-brand hover:text-brand-ink",
  ghost:
    "rounded-full text-brand hover:bg-surface-sunken",
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
