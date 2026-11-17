import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { isOwnKeyProvider, type OwnKey, type OwnKeyProvider } from "@/lib/ai/llm";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * Who pays for a site's AI: the hybrid model.
 *
 *  1. Every site starts with a free allowance on the platform's keys
 *     (`VORTALY_FREE_AI_ACTIONS`, default 5). The first build is one action,
 *     each AI edit is one more. A build that fell back to a stock template
 *     cost nothing and is not counted.
 *  2. An owner who pastes their own key (Gemini, Groq or OpenRouter, free
 *     tiers are fine) uses it for everything from then on, allowance or not.
 *     Their key is never mixed with the platform's: if it fails, the request
 *     fails and says so.
 *  3. Allowance spent and no key: the AI refuses with `key_required`, and the
 *     builder asks for a key. Manual editing keeps working.
 *
 * Keys are encrypted at rest with AES-256-GCM under `VORTALY_KEY_SECRET` and
 * leave this module only as the `OwnKey` handed to `chatJson` for one request.
 * The browser sees the provider and the last four characters, nothing more.
 *
 * Storage mirrors lib/builder/store.ts: the `site_ai` table in production,
 * JSON files under `.vortaly/ai/` in development when there is no table.
 */

const TABLE = "site_ai";
const FILE_DIR = path.join(process.cwd(), ".vortaly", "ai");
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DEFAULT_FREE_ACTIONS = 5;

function devMode(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function freeLimit(): number {
  const raw = Number.parseInt(process.env.VORTALY_FREE_AI_ACTIONS ?? "", 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_FREE_ACTIONS;
}

/* ------------------------------------------------------------ encryption --- */

/**
 * The key-encryption key. Production needs `VORTALY_KEY_SECRET`; development
 * falls back to a fixed value so the builder can be tried locally, which is
 * acceptable only because dev rows live in local files.
 */
function encryptionKey(): Buffer | null {
  const secret = process.env.VORTALY_KEY_SECRET?.trim();
  if (secret) return createHash("sha256").update(secret).digest();
  if (devMode()) return createHash("sha256").update("vortaly-dev-only-key-secret").digest();
  return null;
}

export function ownKeysEnabled(): boolean {
  return encryptionKey() !== null;
}

function encrypt(plain: string): string | null {
  const key = encryptionKey();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, tag, body].map((part) => (typeof part === "string" ? part : part.toString("base64url"))).join(".");
}

function decrypt(sealed: string): string | null {
  const key = encryptionKey();
  const [version, iv, tag, body] = sealed.split(".");
  if (!key || version !== "v1" || !iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    // Wrong secret (rotated) or a tampered row: treat as no key.
    return null;
  }
}

/* --------------------------------------------------------------- storage --- */

interface AiRow {
  id: string;
  free_used: number;
  provider: string | null;
  key_cipher: string | null;
  key_hint: string | null;
  key_added_at: string | null;
  updated_at: string;
}

type LoadRow = { ok: true; row: AiRow } | { ok: false };

function emptyRow(slug: string): AiRow {
  return {
    id: slug,
    free_used: 0,
    provider: null,
    key_cipher: null,
    key_hint: null,
    key_added_at: null,
    updated_at: new Date().toISOString(),
  };
}

function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

function filePath(slug: string): string {
  return path.join(FILE_DIR, `${slug}.json`);
}

async function loadFile(slug: string): Promise<LoadRow> {
  try {
    const row = JSON.parse(await readFile(filePath(slug), "utf8")) as AiRow;
    return { ok: true, row: { ...emptyRow(slug), ...row, id: slug } };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ok: true, row: emptyRow(slug) };
    console.error("[ai.access.loadFile]", error instanceof Error ? error.message : error);
    return { ok: false };
  }
}

async function saveFile(row: AiRow): Promise<boolean> {
  try {
    await mkdir(FILE_DIR, { recursive: true });
    const target = filePath(row.id);
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(row, null, 2), "utf8");
    await rename(temporary, target);
    return true;
  } catch (error) {
    console.error("[ai.access.saveFile]", error instanceof Error ? error.message : error);
    return false;
  }
}

async function loadRow(slug: string): Promise<LoadRow> {
  if (!SLUG.test(slug)) return { ok: false };
  const db = getSupabaseServer();
  if (!db) return devMode() ? loadFile(slug) : { ok: false };

  try {
    const { data, error } = await db
      .from(TABLE)
      .select("id, free_used, provider, key_cipher, key_hint, key_added_at, updated_at")
      .eq("id", slug)
      .maybeSingle<AiRow>();
    if (error) {
      if (isMissingTable(error) && devMode()) return loadFile(slug);
      console.error("[ai.access.loadRow]", error.code ?? "", error.message);
      return { ok: false };
    }
    return { ok: true, row: data ?? emptyRow(slug) };
  } catch (error) {
    console.error("[ai.access.loadRow]", error instanceof Error ? error.message : error);
    return { ok: false };
  }
}

async function saveRow(row: AiRow): Promise<boolean> {
  const next = { ...row, updated_at: new Date().toISOString() };
  const db = getSupabaseServer();
  if (!db) return devMode() ? saveFile(next) : false;

  try {
    const { error } = await db.from(TABLE).upsert(next, { onConflict: "id" });
    if (error) {
      if (isMissingTable(error) && devMode()) return saveFile(next);
      console.error("[ai.access.saveRow]", error.code ?? "", error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[ai.access.saveRow]", error instanceof Error ? error.message : error);
    return false;
  }
}

/* ------------------------------------------------------------ public API --- */

export type AiAccess =
  | { mode: "own"; ownKey: OwnKey }
  | { mode: "free"; freeLeft: number }
  | { mode: "key_required" };

/** Which keys the next AI action for this site runs on, if any. */
export async function resolveAccess(slug: string): Promise<AiAccess | null> {
  const loaded = await loadRow(slug);
  if (!loaded.ok) return null;
  const { row } = loaded;

  if (row.key_cipher && isOwnKeyProvider(row.provider)) {
    const key = decrypt(row.key_cipher);
    if (key) return { mode: "own", ownKey: { provider: row.provider, key } };
  }

  const freeLeft = Math.max(0, freeLimit() - row.free_used);
  return freeLeft > 0 ? { mode: "free", freeLeft } : { mode: "key_required" };
}

/**
 * Counts one action against the free allowance. Call it only after a platform
 * key actually produced the answer. A failed write is logged, not surfaced:
 * the owner already has their result.
 */
export async function recordFreeUse(slug: string): Promise<void> {
  const loaded = await loadRow(slug);
  if (!loaded.ok) return;
  const saved = await saveRow({ ...loaded.row, free_used: loaded.row.free_used + 1 });
  if (!saved) console.warn("[ai.access] free use not recorded for", slug);
}

export interface AiStatus {
  freeLimit: number;
  freeUsed: number;
  freeLeft: number;
  ownKey: { provider: OwnKeyProvider; hint: string; addedAt: string | null } | null;
  /** False in production without `VORTALY_KEY_SECRET`: keys cannot be stored. */
  ownKeysEnabled: boolean;
}

export async function aiStatus(slug: string): Promise<AiStatus | null> {
  const loaded = await loadRow(slug);
  if (!loaded.ok) return null;
  const { row } = loaded;
  const limit = freeLimit();
  return {
    freeLimit: limit,
    freeUsed: row.free_used,
    freeLeft: Math.max(0, limit - row.free_used),
    ownKey:
      row.key_cipher && isOwnKeyProvider(row.provider)
        ? { provider: row.provider, hint: row.key_hint ?? "", addedAt: row.key_added_at }
        : null,
    ownKeysEnabled: ownKeysEnabled(),
  };
}

/** Stores a key that `checkOwnKey` has already accepted. */
export async function storeOwnKey(slug: string, own: OwnKey): Promise<"ok" | "disabled" | "unavailable"> {
  const sealed = encrypt(own.key);
  if (!sealed) return "disabled";
  const loaded = await loadRow(slug);
  if (!loaded.ok) return "unavailable";
  const saved = await saveRow({
    ...loaded.row,
    provider: own.provider,
    key_cipher: sealed,
    key_hint: own.key.slice(-4),
    key_added_at: new Date().toISOString(),
  });
  return saved ? "ok" : "unavailable";
}

export async function removeOwnKey(slug: string): Promise<boolean> {
  const loaded = await loadRow(slug);
  if (!loaded.ok) return false;
  return saveRow({ ...loaded.row, provider: null, key_cipher: null, key_hint: null, key_added_at: null });
}

/** Shape checks before a key is sent anywhere. */
export function plausibleKey(key: string): boolean {
  return key.length >= 20 && key.length <= 200 && /^[\x21-\x7e]+$/.test(key);
}
