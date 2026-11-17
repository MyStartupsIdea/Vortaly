"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { VortalyMark } from "@/components/ui/VortalyMark";
import { cx } from "@/lib/cx";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/dictionaries";

/**
 * The owner's workspace frame, after the Stitch reference: a top bar with the
 * logo, the main sections and the owner's initial, and on wide screens a
 * sidebar with the same sections. On phones the sections become a row under
 * the top bar. Links that need a business (bookings, builder, site) appear
 * once a business is in context.
 */

export type ShellSection = "businesses" | "bookings" | "builder";

type Item = { key: ShellSection | "site"; label: MessageKey; href: string; external?: boolean; icon: ReactNode };

const ICON = "size-[18px] flex-none fill-none stroke-current";

const icons = {
  businesses: (
    <svg aria-hidden viewBox="0 0 20 20" className={ICON} strokeWidth="1.6" strokeLinejoin="round">
      <path d="M3 8.5 4.2 4h11.6L17 8.5M3 8.5h14M3 8.5V16h14V8.5M8 16v-4h4v4" />
    </svg>
  ),
  bookings: (
    <svg aria-hidden viewBox="0 0 20 20" className={ICON} strokeWidth="1.6" strokeLinecap="round">
      <rect x="3" y="4.5" width="14" height="12" rx="2" />
      <path d="M3 8.5h14M7 3v3M13 3v3M6.5 11.5h2M11.5 11.5h2M6.5 14h2" />
    </svg>
  ),
  builder: (
    <svg aria-hidden viewBox="0 0 20 20" className={ICON} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3.5 16.5 9-9M11 5l1-2.5L13 5l2.5 1-2.5 1-1 2.5L11 7 8.5 6zM15.5 11l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" />
    </svg>
  ),
  site: (
    <svg aria-hidden viewBox="0 0 20 20" className={ICON} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="2.5" width="8" height="15" rx="2" />
      <path d="M9 14.5h2" />
    </svg>
  ),
};

function items(slug: string | null | undefined): Item[] {
  const list: Item[] = [{ key: "businesses", label: "o.myBusinesses", href: "/owner", icon: icons.businesses }];
  if (slug) {
    list.push(
      { key: "bookings", label: "sh.bookings", href: `/owner/bookings?salon=${slug}`, icon: icons.bookings },
      { key: "builder", label: "o.open", href: `/builder/${slug}`, icon: icons.builder },
      { key: "site", label: "sh.site", href: `/${slug}`, external: true, icon: icons.site },
    );
  }
  return list;
}

export function AppShell({
  active,
  slug,
  ownerName,
  sidebar = true,
  footer,
  children,
}: {
  active?: ShellSection;
  slug?: string | null;
  ownerName?: string | null;
  sidebar?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const nav = items(slug);
  const initial = ownerName?.trim().charAt(0).toUpperCase();

  const link = (item: Item, variant: "top" | "side") => {
    const on = item.key === active;
    return (
      <Link
        key={item.key}
        href={item.href}
        target={item.external ? "_blank" : undefined}
        aria-current={on ? "page" : undefined}
        className={cx(
          "flex items-center gap-2.5 whitespace-nowrap rounded-tile font-medium transition-colors duration-150",
          variant === "side" ? "px-3 py-2.5 text-[14px]" : "px-3 py-2 text-[14px]",
          on ? "glaze-brand text-brand-ink" : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
        )}
      >
        {variant === "side" && item.icon}
        {t(item.label)}
        {item.external && <span aria-hidden>↗</span>}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-30 border-b border-hairline bg-surface-raised">
        <div className="flex h-16 items-center gap-6 px-4 sm:px-6">
          <Link href="/owner" className="flex items-center gap-2.5" aria-label="Vortaly">
            <VortalyMark size={32} />
            <span className="leading-none">
              <span className="block font-display text-[17px] font-semibold tracking-[-0.03em] text-ink">Vortaly</span>
              <span className="mt-0.5 block text-[10px] font-semibold tracking-[0.08em] text-ink-muted">AI & MINI APPS</span>
            </span>
          </Link>

          <span aria-hidden className="hidden h-6 w-px bg-hairline md:block" />

          <nav aria-label={t("sh.manage")} className="hidden items-center gap-1 md:flex">
            {nav.map((item) => link(item, "top"))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <LanguageSwitcher />
            {initial && (
              <span
                aria-hidden
                className="glaze-brand grid size-9 place-items-center rounded-full font-display text-[15px] font-semibold text-brand-ink"
              >
                {initial}
              </span>
            )}
          </div>
        </div>

        {/* Phones: the same sections as a swipeable row. */}
        <nav aria-label={t("sh.manage")} className="rail gap-1 px-3 pb-2 md:hidden">
          {nav.map((item) => (
            <span key={item.key} className="rail-item">
              {link(item, "top")}
            </span>
          ))}
        </nav>
      </header>

      <div className="flex">
        {sidebar && (
          <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 flex-none flex-col border-r border-hairline bg-surface-raised lg:flex">
            <p className="px-6 pt-7 pb-3 text-[11px] font-semibold tracking-[0.08em] text-ink-muted uppercase">
              {t("sh.manage")}
            </p>
            <nav aria-label={t("sh.manage")} className="flex flex-col gap-1 px-3">
              {nav.map((item) => link(item, "side"))}
            </nav>
            {footer && <div className="mt-auto p-4">{footer}</div>}
          </aside>
        )}

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto w-full max-w-[1040px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
