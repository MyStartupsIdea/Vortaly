"use client";

import type { ReactNode } from "react";

/**
 * Sticky bottom bar holding the step's single action.
 *
 * Inside Telegram the native MainButton would normally own this job, but it
 * cannot show a price next to a label, which is the one thing a customer wants
 * to see before committing. So the bar is ours and sits above the home
 * indicator.
 */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 mt-8 border-t border-hairline bg-surface/85 px-4 pt-3 pb-safe backdrop-blur-md">
      {children}
    </div>
  );
}
