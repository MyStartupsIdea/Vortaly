import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { baseOf, sanitizeSpec, type SiteSpec } from "@/lib/builder/spec";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * Where site specs live.
 *
 * Production: the `sites` table (supabase/schema.sql), one row per tenant with
 * a `draft` the builder edits and a `published` copy the public page serves.
 * Editing never changes what customers see until the operator publishes.
 *
 * Development only: when Supabase is not configured, or the `sites` table has
 * not been created yet, specs are kept as JSON files under `.vortaly/sites/` so
 * the builder can be tried before a migration is applied. That fallback is
 * switched off in production: a deployment without the table reports itself as
 * unavailable rather than writing customer-facing data to a disk that a
 * redeploy would wipe.
 */

export type SiteStorage = "supabase" | "file";

export interface SiteRecord {
  slug: string;
  draft: SiteSpec;
  published: SiteSpec | null;
  updatedAt: string;
  publishedAt: string | null;
  storage: SiteStorage;
}

export type LoadSiteResult =
  | { status: "ok"; site: SiteRecord }
  | { status: "missing" }
  | { status: "unavailable" };

export type SaveSiteResult =
  | { ok: true; site: SiteRecord }
  | { ok: false; reason: "unavailable" | "schema_missing" | "no_tenant" };

const TABLE = "sites";
const FILE_DIR = path.join(process.cwd(), ".vortaly", "sites");
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function fileAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}

/** PostgREST / Postgres codes for "that relation does not exist". */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

interface SiteRow {
  id: string;
  draft: unknown;
  published: unknown;
  updated_at: string;
  published_at: string | null;
}

/** Stored JSON is re-sanitized on the way out: a row is input like any other. */
function toRecord(row: SiteRow, storage: SiteStorage): SiteRecord | null {
  const draftRaw = row.draft as Partial<SiteSpec> | null;
  if (!draftRaw || typeof draftRaw !== "object") return null;

  const draft = sanitizeSpec(draftRaw, {
    slug: row.id,
    name: typeof draftRaw.name === "string" ? draftRaw.name : row.id,
    phone: typeof draftRaw.phone === "string" ? draftRaw.phone : "",
    kind: draftRaw.kind ?? "custom",
  });

  const published =
    row.published && typeof row.published === "object"
      ? sanitizeSpec(row.published, baseOf(draft))
      : null;

  return {
    slug: row.id,
    draft,
    published,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    storage,
  };
}

/* ------------------------------------------------------------ file store --- */

function filePath(slug: string): string {
  return path.join(FILE_DIR, `${slug}.json`);
}

async function loadFile(slug: string): Promise<LoadSiteResult> {
  try {
    const row = JSON.parse(await readFile(filePath(slug), "utf8")) as SiteRow;
    const site = toRecord({ ...row, id: slug }, "file");
    return site ? { status: "ok", site } : { status: "missing" };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "missing" };
    console.error("[sites.loadFile]", error instanceof Error ? error.message : error);
    return { status: "unavailable" };
  }
}

async function saveFile(row: SiteRow): Promise<SaveSiteResult> {
  try {
    await mkdir(FILE_DIR, { recursive: true });
    // Write-then-rename, so a crash mid-write cannot leave half a file.
    const target = filePath(row.id);
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(row, null, 2), "utf8");
    await rename(temporary, target);
    const site = toRecord(row, "file");
    return site ? { ok: true, site } : { ok: false, reason: "unavailable" };
  } catch (error) {
    console.error("[sites.saveFile]", error instanceof Error ? error.message : error);
    return { ok: false, reason: "unavailable" };
  }
}

/* ------------------------------------------------------------------ load --- */

export async function loadSite(slug: string): Promise<LoadSiteResult> {
  if (!SLUG.test(slug)) return { status: "missing" };

  const db = getSupabaseServer();
  if (!db) return fileAllowed() ? loadFile(slug) : { status: "unavailable" };

  try {
    const { data, error } = await db
      .from(TABLE)
      .select("id, draft, published, updated_at, published_at")
      .eq("id", slug)
      .maybeSingle<SiteRow>();

    if (error) {
      if (isMissingTable(error)) {
        return fileAllowed() ? loadFile(slug) : { status: "unavailable" };
      }
      console.error("[sites.loadSite]", error.code ?? "", error.message);
      return { status: "unavailable" };
    }
    if (!data) return { status: "missing" };

    const site = toRecord(data, "supabase");
    return site ? { status: "ok", site } : { status: "missing" };
  } catch (error) {
    console.error("[sites.loadSite]", error instanceof Error ? error.message : error);
    return { status: "unavailable" };
  }
}

/* ------------------------------------------------------------------ save --- */

async function writeRow(row: SiteRow): Promise<SaveSiteResult> {
  const db = getSupabaseServer();
  if (!db) {
    return fileAllowed() ? saveFile(row) : { ok: false, reason: "unavailable" };
  }

  try {
    const { data, error } = await db
      .from(TABLE)
      .upsert(row, { onConflict: "id" })
      .select("id, draft, published, updated_at, published_at")
      .single<SiteRow>();

    if (error) {
      if (isMissingTable(error)) {
        return fileAllowed() ? saveFile(row) : { ok: false, reason: "schema_missing" };
      }
      // 23503: the `sites.id -> salons.id` foreign key. There is no such tenant.
      if (error.code === "23503") return { ok: false, reason: "no_tenant" };
      console.error("[sites.writeRow]", error.code ?? "", error.message);
      return { ok: false, reason: "unavailable" };
    }

    const site = toRecord(data, "supabase");
    return site ? { ok: true, site } : { ok: false, reason: "unavailable" };
  } catch (error) {
    console.error("[sites.writeRow]", error instanceof Error ? error.message : error);
    return { ok: false, reason: "unavailable" };
  }
}

/** Saves the working copy. What customers see is untouched. */
export async function saveDraft(slug: string, draft: SiteSpec): Promise<SaveSiteResult> {
  const current = await loadSite(slug);
  if (current.status === "unavailable") return { ok: false, reason: "unavailable" };

  const existing = current.status === "ok" ? current.site : null;
  return writeRow({
    id: slug,
    draft: { ...draft, slug },
    published: existing?.published ?? null,
    updated_at: new Date().toISOString(),
    published_at: existing?.publishedAt ?? null,
  });
}

export interface PublishResult {
  site: SiteRecord;
  /** False when bookings cannot be taken yet; `staffWarning` says why. */
  staffSynced: boolean;
  staffWarning?: "no_database" | "no_tenant" | "unavailable";
}

/**
 * Makes the draft the public version, and mirrors its staff into `masters`.
 *
 * The mirror exists because `bookings.master_id` is a foreign key to
 * `masters(id)`: a booking for a generated tenant needs that row. Prices and
 * durations are not mirrored — the booking API reads those from the published
 * spec itself (see app/api/bookings/route.ts).
 */
export async function publishSite(
  slug: string,
): Promise<{ ok: true; result: PublishResult } | { ok: false; reason: SaveFailure }> {
  const current = await loadSite(slug);
  if (current.status === "unavailable") return { ok: false, reason: "unavailable" };
  if (current.status === "missing") return { ok: false, reason: "missing" };

  const now = new Date().toISOString();
  const saved = await writeRow({
    id: slug,
    draft: current.site.draft,
    published: current.site.draft,
    updated_at: now,
    published_at: now,
  });
  if (!saved.ok) return { ok: false, reason: saved.reason };

  const sync = await syncStaff(saved.site.draft);
  return {
    ok: true,
    result: { site: saved.site, staffSynced: sync === "ok", staffWarning: sync === "ok" ? undefined : sync },
  };
}

type SaveFailure = "unavailable" | "schema_missing" | "no_tenant" | "missing";

async function syncStaff(
  spec: SiteSpec,
): Promise<"ok" | "no_database" | "no_tenant" | "unavailable"> {
  const db = getSupabaseServer();
  if (!db) return "no_database";

  try {
    if (spec.staff.length > 0) {
      const { error } = await db.from("masters").upsert(
        spec.staff.map((member) => ({
          id: member.id,
          salon_id: spec.slug,
          name: member.name,
          craft_ru: member.role.ru,
          craft_uz: member.role.uz,
          workdays: member.workdays,
          shift_start: member.shiftStart,
          shift_end: member.shiftEnd,
          tint: member.tint,
          is_active: true,
        })),
        { onConflict: "id" },
      );
      if (error) {
        if (error.code === "23503") return "no_tenant";
        console.error("[sites.syncStaff]", error.code ?? "", error.message);
        return "unavailable";
      }
    }

    // A removed resource is retired, never deleted: past bookings point at it.
    const keep = spec.staff.map((member) => member.id);
    let retire = db
      .from("masters")
      .update({ is_active: false })
      .eq("salon_id", spec.slug)
      .like("id", `${spec.slug}-m%`);
    if (keep.length > 0) retire = retire.not("id", "in", `(${keep.join(",")})`);
    const { error: retireError } = await retire;
    if (retireError) {
      console.error("[sites.syncStaff.retire]", retireError.code ?? "", retireError.message);
      return "unavailable";
    }

    return "ok";
  } catch (error) {
    console.error("[sites.syncStaff]", error instanceof Error ? error.message : error);
    return "unavailable";
  }
}

/** True when a draft for this slug already exists in the dev file store. */
export async function fileSiteExists(slug: string): Promise<boolean> {
  if (!fileAllowed()) return false;
  return (await loadFile(slug)).status === "ok";
}

/** True when the platform runs with no database at all (local trial mode). */
export function localOnlyMode(): boolean {
  return fileAllowed() && getSupabaseServer() === null;
}
