"use client";

import { usePathname } from "next/navigation";
import { LANGUAGE_SWITCHER } from "@/components/admin/UzMiniAdminLanguageSwitcher";
import { salon } from "@/lib/data/salon";
import { formatPhone } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { cx } from "@/lib/cx";
import type { ReactNode } from "react";

/**
 * Full-width admin shell. Unlike the Mini App frame, the admin panel is a
 * desktop/tablet tool for the salon owner, so it ignores the 460px max-width
 * and renders edge to edge, with a fixed sidebar on wide screens and a
 * collapsible rail on tablets.
 */
export function UzMiniAdminShell({ children }: { children: ReactNode }) {
  const { t, tr } = useI18n();

  return (
    <div className="flex h-screen min-h-screen flex-col bg-surface">
      {/* Top bar: salon identity + locale switcher. */}
      <header className="shrink-0 border-b border-hairline bg-surface-raised">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="font-display text-lg font-bold tracking-[-0.03em] text-petrol">
              {salon.name}
            </span>
            <span className="hidden sm:inline text-[13px] text-ink-muted">
              {tr(salon.tagline)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={`tel:+${salon.phone}`}
              className="rounded-full border border-hairline px-3 py-1.5 text-[13px] font-semibold text-petrol hover:bg-surface-sunken sm:not-transparent"
            >
              {formatPhone(salon.phone)}
            </a>
            <LANGUAGE_SWITCHER />
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: navigation links. On tablet (<1024px) it becomes a thin
         * rail tucked off-canvas so the table keeps its width. */}
        <aside
          id="admin-sidebar"
          className={cx(
            "flex flex-col border-r border-hairline bg-surface-raised transition-transform duration-200 lg:translate-x-0",
            "fixed inset-y-0 left-0 z-30 w-56 lg:static lg:block lg:translate-x-0",
          )}
        >
          <nav className="flex flex-col gap-1 p-3">
            <AdminNavItem
              href="/admin"
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="size-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V5z" />
                </svg>
              }
              label="recordings"
            />
            <AdminNavItem
              href="/admin/services"
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="size-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 11-2 0V4a1 1 0 10-2 0v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm10 0H6V4h8v12z" />
                </svg>
              }
              label="services"
            />
            <AdminNavItem
              href="/admin/settings"
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" className="size-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.406 2.406.734 1.372.458 2.568.948 2.286a1.532 1.532 0 010 2.98c-.734 1.372.152 2.942 2.406 2.406a1.532 1.532 0 012.286.948c1.372.836 2.942-.734 2.406-2.406a1.532 1.532 0 01.948-2.286c1.56 0 2.98 1.42 2.98 2.98a1.532 1.532 0 01-2.98 0c0 1.62-.85 2.92-2.148 3.234a3.004 3.004 0 003.564 0 1.532 1.532 0 010-2.98c1.42-1.56 3.234-2.148 3.234-3.564 0-.38 0-.76-.02-1.132a.627.627 0 00-.12-.256 11.283 11.283 0 00-1.654-.654c-1.56 0-2.98 1.42-2.98 2.98 0 1.16.58 2.148 1.448 2.64a1.532 1.532 0 01-1.448-1.08c0-.38.02-.76.02-1.132 0-1.56-1.42-2.98-2.98-2.98-1.56 0-2.98 1.42-2.98 2.98 0 .38.02.76.02 1.132a.627.627 0 00.12.256 11.283 11.283 0 001.654.654c1.56 0 2.98-1.42 2.98-2.98 0-1.16-.58-2.148-1.448-2.64a1.532 1.532 0 011.448 1.08c0 .38-.02.76-.02 1.132zM10 13a3 3 0 100-6 3 3 0 000 6z" />
                </svg>
              }
              label="settings"
            />
          </nav>

          {/* Salon summary card under the nav. */}
          <div className="mt-auto border-t border-hairline p-3">
            <p className="text-[11px] font-medium text-ink-muted">{t("admin.ownedBy")}</p>
            <p className="font-display text-[15px] font-bold text-petrol">{salon.name}</p>
            <p className="text-[12px] text-ink-muted">{tr(salon.tagline)}</p>
          </div>
        </aside>

        {/* Main content. Tablet rail toggle button lives here. */}
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <div className="flex-1 overflow-auto">
            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Whether a nav item points at the page being viewed.
 *
 * Each item previously received a `currentPath` equal to its own `href`, so
 * the comparison was always true and every item rendered as active at once.
 * The route now comes from the router instead.
 *
 * "/admin" is matched exactly, because as a prefix it would also claim every
 * page nested under it; the deeper items match their own subtree so that a
 * future /admin/services/<id> still highlights Services.
 */
function isActive(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (href === "/admin") return path === "/admin";
  return path === href || path.startsWith(`${href}/`);
}

interface AdminNavItemProps {
  href: string;
  icon: React.ReactNode;
  label: keyof typeof adminNavLabels.ru;
}

const adminNavLabels = {
  ru: {
    recordings: "Записи",
    services: "Услуги",
    settings: "Настройки",
  },
  uz: {
    recordings: "Bandlar",
    services: "Xizmatlar",
    settings: "Sozlamalar",
  },
} as const;

function AdminNavItem({ href, icon, label }: AdminNavItemProps) {
  const { locale } = useI18n();
  const pathname = usePathname();
  const active = isActive(href, pathname);
  const text = adminNavLabels[locale][label];

  return (
    <a
      href={href}
      className={cx(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition-colors duration-150",
        active
          ? "bg-brand/10 text-brand"
          : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
      )}
    >
      {icon}
      {text}
      {active && (
        <span className="ml-auto size-1.5 rounded-full bg-brand" />
      )}
    </a>
  );
}
