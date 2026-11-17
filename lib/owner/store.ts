import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * Which Telegram accounts own which businesses, and the invite links that
 * create those links.
 *
 * An owner is attached to a business in exactly one way: the platform operator
 * creates a one-time invite for that business and sends the link to the owner;
 * the owner opens it and signs in with Telegram, and that Telegram account is
 * linked. The invite then dies, so a forwarded copy opens nothing. Only a hash
 * of the invite code is stored.
 *
 * Production: `owner_links` and `owner_invites` (supabase/schema.sql).
 * Development: one JSON file, `.vortaly/owners.json`, when there is no database
 * or no tables, like lib/builder/store.ts.
 */

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FILE = path.join(process.cwd(), ".vortaly", "owners.json");

function devMode(): boolean {
  return process.env.NODE_ENV !== "production";
}

function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/* --------------------------------------------------------------- dev file --- */

interface Link {
  salon_id: string;
  telegram_user_id: number;
  created_at: string;
}

interface Invite {
  code_hash: string;
  salon_id: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by: number | null;
}

interface FileData {
  links: Link[];
  invites: Invite[];
}

async function readData(): Promise<FileData | null> {
  try {
    const data = JSON.parse(await readFile(FILE, "utf8")) as Partial<FileData>;
    return { links: data.links ?? [], invites: data.invites ?? [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { links: [], invites: [] };
    console.error("[owner.store.read]", error instanceof Error ? error.message : error);
    return null;
  }
}

async function writeData(data: FileData): Promise<boolean> {
  try {
    await mkdir(path.dirname(FILE), { recursive: true });
    const temporary = `${FILE}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(data, null, 2), "utf8");
    await rename(temporary, FILE);
    return true;
  } catch (error) {
    console.error("[owner.store.write]", error instanceof Error ? error.message : error);
    return false;
  }
}

/** The database, or null when development should use the file instead. */
type Db = NonNullable<ReturnType<typeof getSupabaseServer>>;
type Backend = { kind: "db"; db: Db } | { kind: "file" } | { kind: "none" };

function backend(): Backend {
  const db = getSupabaseServer();
  if (db) return { kind: "db", db };
  return devMode() ? { kind: "file" } : { kind: "none" };
}

/* ------------------------------------------------------------------ links --- */

/** Slugs this Telegram account owns, or null when storage cannot answer. */
export async function ownedSlugs(telegramId: number): Promise<string[] | null> {
  const store = backend();
  if (store.kind === "none") return null;

  if (store.kind === "db") {
    const { data, error } = await store.db
      .from("owner_links")
      .select("salon_id")
      .eq("telegram_user_id", telegramId);
    if (!error) return (data ?? []).map((row: { salon_id: string }) => row.salon_id);
    if (!(isMissingTable(error) && devMode())) {
      console.error("[owner.store.ownedSlugs]", error.code ?? "", error.message);
      return null;
    }
  }

  const file = await readData();
  return file ? file.links.filter((link) => link.telegram_user_id === telegramId).map((link) => link.salon_id) : null;
}

/** Telegram ids of everyone who owns this business, or null when storage cannot answer. */
export async function ownersOf(slug: string): Promise<number[] | null> {
  const store = backend();
  if (store.kind === "none") return null;

  if (store.kind === "db") {
    const { data, error } = await store.db
      .from("owner_links")
      .select("telegram_user_id")
      .eq("salon_id", slug);
    if (!error) {
      return (data ?? []).map((row: { telegram_user_id: number | string }) => Number(row.telegram_user_id));
    }
    if (!(isMissingTable(error) && devMode())) {
      console.error("[owner.store.ownersOf]", error.code ?? "", error.message);
      return null;
    }
  }

  const file = await readData();
  return file ? file.links.filter((link) => link.salon_id === slug).map((link) => link.telegram_user_id) : null;
}

export async function ownsSlug(telegramId: number, slug: string): Promise<boolean> {
  return (await ownedSlugs(telegramId))?.includes(slug) ?? false;
}

/* ---------------------------------------------------------------- invites --- */

export async function createInvite(slug: string): Promise<{ code: string; expiresAt: string } | null> {
  const code = randomBytes(18).toString("base64url");
  const now = Date.now();
  const invite: Invite = {
    code_hash: hashCode(code),
    salon_id: slug,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + INVITE_TTL_MS).toISOString(),
    used_at: null,
    used_by: null,
  };

  const store = backend();
  if (store.kind === "none") return null;

  if (store.kind === "db") {
    const { error } = await store.db.from("owner_invites").insert(invite);
    if (!error) return { code, expiresAt: invite.expires_at };
    if (!(isMissingTable(error) && devMode())) {
      console.error("[owner.store.createInvite]", error.code ?? "", error.message);
      return null;
    }
  }

  const file = await readData();
  if (!file) return null;
  file.invites.push(invite);
  return (await writeData(file)) ? { code, expiresAt: invite.expires_at } : null;
}

export type ClaimResult =
  | { ok: true; slug: string }
  | { ok: false; reason: "invalid" | "expired" | "used" | "unavailable" };

/**
 * Spends an invite and links the Telegram account to its business.
 *
 * The database path marks the invite used with one conditional UPDATE, so two
 * people racing with the same link cannot both win. Opening your own, already
 * used invite again is answered as success: it changes nothing.
 */
export async function claimInvite(code: string, telegramId: number): Promise<ClaimResult> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) return { ok: false, reason: "invalid" };
  const codeHash = hashCode(code);
  const nowIso = new Date().toISOString();
  const store = backend();
  if (store.kind === "none") return { ok: false, reason: "unavailable" };

  if (store.kind === "db") {
    const { data, error } = await store.db
      .from("owner_invites")
      .update({ used_at: nowIso, used_by: telegramId })
      .eq("code_hash", codeHash)
      .is("used_at", null)
      .gt("expires_at", nowIso)
      .select("salon_id")
      .maybeSingle<{ salon_id: string }>();

    if (!error) {
      if (data) {
        const { error: linkError } = await store.db
          .from("owner_links")
          .upsert(
            { salon_id: data.salon_id, telegram_user_id: telegramId },
            { onConflict: "salon_id,telegram_user_id" },
          );
        if (linkError) {
          console.error("[owner.store.claim.link]", linkError.code ?? "", linkError.message);
          return { ok: false, reason: "unavailable" };
        }
        return { ok: true, slug: data.salon_id };
      }
      // Nothing updated: say why.
      const { data: row } = await store.db
        .from("owner_invites")
        .select("salon_id, expires_at, used_at, used_by")
        .eq("code_hash", codeHash)
        .maybeSingle<Pick<Invite, "salon_id" | "expires_at" | "used_at" | "used_by">>();
      if (!row) return { ok: false, reason: "invalid" };
      if (row.used_at) {
        return row.used_by === telegramId ? { ok: true, slug: row.salon_id } : { ok: false, reason: "used" };
      }
      return { ok: false, reason: "expired" };
    }
    if (!(isMissingTable(error) && devMode())) {
      console.error("[owner.store.claim]", error.code ?? "", error.message);
      return { ok: false, reason: "unavailable" };
    }
  }

  const file = await readData();
  if (!file) return { ok: false, reason: "unavailable" };
  const invite = file.invites.find((entry) => entry.code_hash === codeHash);
  if (!invite) return { ok: false, reason: "invalid" };
  if (invite.used_at) {
    return invite.used_by === telegramId ? { ok: true, slug: invite.salon_id } : { ok: false, reason: "used" };
  }
  if (invite.expires_at <= nowIso) return { ok: false, reason: "expired" };

  invite.used_at = nowIso;
  invite.used_by = telegramId;
  if (!file.links.some((link) => link.salon_id === invite.salon_id && link.telegram_user_id === telegramId)) {
    file.links.push({ salon_id: invite.salon_id, telegram_user_id: telegramId, created_at: nowIso });
  }
  return (await writeData(file)) ? { ok: true, slug: invite.salon_id } : { ok: false, reason: "unavailable" };
}
