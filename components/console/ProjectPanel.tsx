"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { SalonRecord } from "@/lib/api/salons";
import { PROJECTS, ROOT_DOMAIN, type ProjectStatus } from "@/lib/data/projects";
import { formatPhone } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { cx } from "@/lib/cx";

/* The dot is the whole status indicator: a glazed bead for a running project,
   unglazed biscuit for one that is parked. No badges, no pills. */
const DOT: Record<ProjectStatus, string> = {
  live: "bg-brand",
  building: "bg-saffron",
  queued: "bg-ink-muted/50",
  paused: "biscuit",
  failed: "bg-accent",
};

const STATUS_KEY = {
  live: "console.status.live",
  building: "console.status.building",
  queued: "console.status.queued",
  paused: "console.status.paused",
  failed: "console.status.failed",
} as const;

/** The project created during this session, before or without a database row. */
export interface SessionCard {
  slug: string;
  name: string;
  subdomain: string;
  persisted: boolean;
  warning?: string;
}

/** One row shape for real salons, the session card and the demo fallback. */
interface Row {
  slug: string;
  name: string;
  status: ProjectStatus;
  note: string;
  progress?: number;
  /** Null when there is no tenant to open yet. */
  href: string | null;
  fresh?: boolean;
}

function toRow(salon: SalonRecord): Row {
  return {
    slug: salon.id,
    name: salon.name,
    // A salon that answers from the salons table is serving traffic.
    status: "live",
    note: salon.phone ? formatPhone(salon.phone.replace(/^\+/, "")) : "",
    href: `/${salon.id}`,
  };
}

function RowBody({ row }: { row: Row }) {
  const { t } = useI18n();

  return (
    <>
      <span className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={cx(
            "size-2 flex-none rounded-full",
            DOT[row.status],
            row.status === "building" && "motion-safe:animate-pulse",
          )}
        />
        <span className="min-w-0 flex-1 truncate font-display text-[14px] font-bold tracking-[-0.01em]">
          {row.name}
        </span>
        {typeof row.progress === "number" && (
          <span className="flex-none font-mono text-[11px] text-saffron tabular-nums">
            {row.progress}%
          </span>
        )}
      </span>

      <span className="mt-1 block truncate pl-[18px] font-mono text-[11px] text-ink-muted">
        {row.slug}.{ROOT_DOMAIN}
      </span>

      <span className="mt-1 flex items-baseline gap-2 pl-[18px] text-[11px] text-ink-muted">
        <span className={row.status === "failed" ? "text-accent" : undefined}>
          {t(STATUS_KEY[row.status])}
        </span>
        {row.note && (
          <>
            <span aria-hidden className="h-2.5 w-px bg-hairline" />
            <span className="min-w-0 truncate">{row.note}</span>
          </>
        )}
      </span>
    </>
  );
}

function ProjectRow({ row }: { row: Row }) {
  const shell = (children: ReactNode) => (
    <li>
      {row.href ? (
        <Link
          href={row.href}
          className={cx(
            "block border-b border-hairline px-4 py-3 transition-colors duration-150 hover:bg-surface-raised",
            row.fresh && "bg-brand/8",
          )}
        >
          {children}
        </Link>
      ) : (
        /* No link: without a tenant to open, a clickable row would lie. */
        <div
          className={cx(
            "block border-b border-hairline px-4 py-3",
            row.fresh && "bg-accent/8",
          )}
        >
          {children}
        </div>
      )}
    </li>
  );

  return shell(<RowBody row={row} />);
}

interface Props {
  salons: SalonRecord[] | null;
  /** Server-side note, e.g. Supabase not configured. */
  warning: string | null;
  card: SessionCard | null;
  onRefresh: () => void;
}

export function ProjectPanel({ salons, warning, card, onRefresh }: Props) {
  const { t } = useI18n();

  const loading = salons === null;
  const live = salons ?? [];

  // With nothing to show, fall back to the demo projects rather than an empty
  // column — and say so, so nobody mistakes them for real tenants.
  const usingDemo = !loading && live.length === 0 && !card;

  const baseRows: Row[] = usingDemo
    ? PROJECTS.map((project) => ({
        slug: project.id,
        name: project.name,
        status: project.status,
        progress: project.progress,
        note: "",
        href: `/${project.id}`,
      }))
    : live.map(toRow);

  // The freshly created project is pinned on top. Once the refetch brings it
  // back from the database the row is already there, so it is not duplicated.
  const rows: Row[] =
    card && !baseRows.some((row) => row.slug === card.slug)
      ? [
          {
            slug: card.slug,
            name: card.name,
            status: card.persisted ? "live" : "failed",
            note: card.persisted ? t("console.touchedNow") : t("run.notPersisted"),
            href: card.persisted ? `/${card.slug}` : null,
            fresh: true,
          },
          ...baseRows,
        ]
      : baseRows.map((row) => (row.slug === card?.slug ? { ...row, fresh: true } : row));

  return (
    <aside className="flex h-full min-h-0 flex-col border-hairline lg:border-r">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-5 pb-2">
        <h2 className="font-display text-[15px] font-bold tracking-[-0.01em]">
          {t("console.projects")}
        </h2>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="text-[12px] font-semibold text-brand disabled:opacity-45"
        >
          {t("list.refresh")}
        </button>
      </div>

      <p className="px-4 pb-3 font-mono text-[11px] text-ink-muted">{t("list.source")}</p>

      {usingDemo && (
        <p className="mx-4 mb-3 rounded-tile border border-saffron/40 bg-saffron/10 px-3 py-2 text-[11px] leading-snug">
          {t("list.demo")}
        </p>
      )}

      <ul className="min-h-0 flex-1 overflow-y-auto border-t border-hairline">
        {loading && rows.length === 0 ? (
          <li className="px-4 py-4">
            <span className="text-[12px] text-ink-muted">{t("list.loading")}</span>
            <span className="mt-3 block space-y-2">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="block h-12 animate-pulse rounded-tile bg-surface-sunken"
                />
              ))}
            </span>
          </li>
        ) : rows.length === 0 ? (
          <li className="px-4 py-6 text-[12px] text-ink-muted">{t("list.empty")}</li>
        ) : (
          rows.map((row) => <ProjectRow key={row.slug} row={row} />)
        )}
      </ul>

      <div className="border-t border-hairline px-4 py-3">
        <p className="font-mono text-[11px] text-ink-muted">
          {ROOT_DOMAIN}
          <span className="ml-2 tabular-nums">{rows.length}</span>
        </p>
        {warning && (
          <p className="mt-1 font-mono text-[10px] leading-snug break-words text-ink-muted/70">
            {warning}
          </p>
        )}
      </div>
    </aside>
  );
}
