"use client";

import type { ReactNode } from "react";

/**
 * Chrome and placeholder states shared by the admin page's panels.
 *
 * These are deliberately presentational: they take what to show and render it.
 * No data fetching, no state of their own — the page still owns every bit of
 * that, which is what keeps this refactor behaviour-preserving.
 */

/** The panel heading, so both sections keep the same type treatment. */
function AdminSectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-display text-[15px] font-bold tracking-[-0.02em] text-ink">
      {children}
    </h2>
  );
}

/**
 * A bordered panel with a heading and, optionally, a control on the heading
 * row. Without an action the heading stands alone; with one the two sit on a
 * shared baseline, which is how the services editor already looked.
 */
export function AdminSection({
  title,
  action,
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card border border-hairline bg-surface-raised p-4">
      {action ? (
        <div className="flex items-baseline justify-between gap-3">
          <AdminSectionTitle>{title}</AdminSectionTitle>
          {action}
        </div>
      ) : (
        <AdminSectionTitle>{title}</AdminSectionTitle>
      )}
      {children}
    </section>
  );
}

/** The default glyph: an empty page of a calendar. */
function CalendarGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="size-8 text-ink-muted/40"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7a2 2 0 100-4 2 2 0 000 4zm-1 4a1 1 0 110-2 1 1 0 010 2z"
      />
    </svg>
  );
}

/**
 * Nothing to show. `message` says what is absent; `action` is for a way out of
 * the state, such as clearing a filter, when there is one.
 */
export function AdminEmptyState({
  message,
  icon,
  action,
}: {
  message: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mt-6 flex flex-col items-center justify-center gap-2 py-10 text-center">
      {icon ?? <CalendarGlyph />}
      <p className="text-[14px] text-ink-muted">{message}</p>
      {action}
    </div>
  );
}
