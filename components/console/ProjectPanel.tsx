"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import type { SalonRecord, UnlockResult } from "@/lib/api/salons";
import { PROJECTS, ROOT_DOMAIN, type ProjectStatus } from "@/lib/data/projects";
import { SaveBadge } from "@/components/ui/SaveBadge";
import { classifySave, SAVE_STATE_DOT, type SaveState } from "@/lib/save-state";
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
  /** Path of the site builder, when a site draft was generated. */
  builder?: string;
}

/** One row shape for real salons, the session card and the demo fallback. */
interface Row {
  slug: string;
  name: string;
  status: ProjectStatus;
  /**
   * Set only for a project created in this session, where the console knows
   * whether the row reached the database. When it is anything but `saved` it
   * replaces the status label: "not saved" is not a build status, and showing
   * it as `failed` would blame the pipeline for a datastore problem.
   */
  saveState?: SaveState;
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
    // The console is the operator's tool: a project opens in its builder,
    // which links on to the public page once something is published.
    href: `/builder/${salon.id}`,
  };
}

function RowBody({ row }: { row: Row }) {
  const { t } = useI18n();

  const unsaved = row.saveState !== undefined && row.saveState !== "saved";

  return (
    <>
      <span className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={cx(
            "size-2 flex-none rounded-full",
            unsaved ? SAVE_STATE_DOT[row.saveState!] : DOT[row.status],
            !unsaved && row.status === "building" && "motion-safe:animate-pulse",
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
        {unsaved ? (
          <SaveBadge state={row.saveState!} variant="dot" />
        ) : (
          <span className={row.status === "failed" ? "text-accent" : undefined}>
            {t(STATUS_KEY[row.status])}
          </span>
        )}
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
            row.fresh && "bg-saffron/8",
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
  /**
   * The admin API refused this browser. Distinct from an empty list: the
   * platform may well have tenants, we are simply not allowed to read them,
   * so neither an empty state nor the demo projects may stand in for them.
   */
  unauthorized: boolean;
  /** False when the deployment has no PLATFORM_ADMIN_SECRET at all. */
  authConfigured: boolean;
  /** True when this browser holds a valid admin session. */
  authorized: boolean;
  onUnlock: (secret: string) => Promise<UnlockResult>;
  onLock: () => void;
}

/**
 * Exchanges the platform-admin secret for a server-side session.
 *
 * The field is a password input, its value lives only in this component's
 * state for the duration of the submit, and it is cleared on success. The
 * secret is never written to localStorage, never put in a URL, and never
 * becomes part of the bundle — the only thing the browser keeps is the
 * httpOnly cookie the server sets, which this code cannot read.
 */
function UnlockForm({
  authConfigured,
  onUnlock,
}: {
  authConfigured: boolean;
  onUnlock: (secret: string) => Promise<UnlockResult>;
}) {
  const { t } = useI18n();
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Exclude<UnlockResult, { ok: true }>["reason"] | null>(
    null,
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!secret || busy) return;
    setBusy(true);
    setFailure(null);
    const result = await onUnlock(secret);
    setBusy(false);
    if (result.ok) {
      setSecret("");
      return;
    }
    setFailure(result.reason);
  };

  const message =
    failure === "denied"
      ? t("list.unlockDenied")
      : failure === "throttled"
        ? t("list.unlockThrottled")
        : failure === "not_configured"
          ? t("list.notConfigured")
          : failure === "unreachable"
            ? t("list.unlockUnreachable")
            : null;

  return (
    <form onSubmit={submit} className="mx-4 mb-3 space-y-2">
      <p className="rounded-tile border border-saffron/40 bg-saffron/10 px-3 py-2 text-[11px] leading-snug">
        {t("list.locked")}
      </p>

      {authConfigured ? (
        <>
          <p className="text-[11px] leading-snug text-ink-muted">{t("list.lockedHint")}</p>
          <input
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            placeholder={t("list.secretLabel")}
            aria-label={t("list.secretLabel")}
            className="h-9 w-full rounded-md border border-hairline bg-surface-sunken px-2 font-mono text-[12px] text-ink placeholder:text-ink-muted"
          />
          <button
            type="submit"
            disabled={busy || secret.length === 0}
            className="h-9 w-full rounded-md bg-brand text-[12px] font-semibold text-white disabled:opacity-45"
          >
            {busy ? t("list.unlocking") : t("list.unlock")}
          </button>
        </>
      ) : (
        /* Nothing to type: with no secret on the server, no value can open the
           admin API. Offering a field would invite guessing at a value that
           does not exist. */
        <p className="text-[11px] leading-snug text-ink-muted">{t("list.notConfigured")}</p>
      )}

      {message && (
        <p role="status" className="text-[11px] leading-snug text-accent">
          {message}
        </p>
      )}
    </form>
  );
}

export function ProjectPanel({
  salons,
  warning,
  card,
  onRefresh,
  unauthorized,
  authConfigured,
  authorized,
  onUnlock,
  onLock,
}: Props) {
  const { t } = useI18n();

  const loading = salons === null;
  const live = salons ?? [];

  /* With nothing to show, fall back to the demo projects rather than an empty
     column — and say so, so nobody mistakes them for real tenants.

     A refused request is not "nothing to show": the list is unknown, not
     empty, so the demo rows stay out and the panel asks for the credential
     instead. Standing demo projects in for a 401 would claim the platform has
     these five tenants when we have not been allowed to look. */
  const usingDemo = !loading && !unauthorized && live.length === 0 && !card;

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
  const cardState = card ? classifySave(card) : null;

  const rows: Row[] =
    card && cardState && !baseRows.some((row) => row.slug === card.slug)
      ? [
          {
            slug: card.slug,
            name: card.name,
            // "live" is only ever claimed for a row that is really in the
            // database; otherwise saveState carries the outcome.
            status: cardState === "saved" ? "live" : "queued",
            saveState: cardState,
            note: cardState === "saved" ? t("console.touchedNow") : "",
            href: card.builder ?? (cardState === "saved" ? `/builder/${card.slug}` : null),
            fresh: true,
          },
          ...baseRows,
        ]
      : baseRows.map((row) =>
          row.slug === card?.slug
            ? { ...row, fresh: true, saveState: cardState ?? undefined }
            : row,
        );

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

      {unauthorized && <UnlockForm authConfigured={authConfigured} onUnlock={onUnlock} />}

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
          /* "No projects" is a claim about the platform, so it is only made
             when the server actually answered with an empty list. */
          <li className="px-4 py-6 text-[12px] text-ink-muted">
            {unauthorized ? t("list.locked") : t("list.empty")}
          </li>
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
        {authorized && (
          <button
            type="button"
            onClick={onLock}
            className="mt-2 text-[11px] font-semibold text-ink-muted hover:text-ink"
          >
            {t("list.lock")}
          </button>
        )}
      </div>
    </aside>
  );
}
