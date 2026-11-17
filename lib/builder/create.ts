import "server-only";

import { recordFreeUse } from "@/lib/ai/access";
import { generateSpec } from "@/lib/builder/generate";
import { cleanPhone } from "@/lib/builder/spec";
import { fileSiteExists, localOnlyMode, saveDraft } from "@/lib/builder/store";
import { detectKind } from "@/lib/console/brief";
import { linkOwner, ownedSlugs } from "@/lib/owner/store";
import { createSalon, findSalonBySlug, isValidSlug, slugFor } from "@/lib/supabase/salons";

/**
 * Self-serve start: a business owner, signed in with Telegram, describes their
 * business and gets a working draft site in their own builder, with no
 * platform operator involved. This is the product's main path.
 *
 * The steps are the operator's provisioning ones (app/api/admin/provision),
 * minus the narrated log: a free slug, the tenant row, the AI-written draft.
 * Then the owner is linked to what they just created.
 *
 * Limits, because anyone with Telegram can call this:
 *  - VORTALY_MAX_BUSINESSES_PER_OWNER businesses per account (default 3),
 *    counted from the stored links, so it holds across servers and restarts;
 *  - one new business per account per minute (per server instance; a soft
 *    brake against double submits and scripts, the count above is the hard one);
 *  - the first build is the site's first free AI action, like any other.
 */

/** Paths that a slug must not shadow. Mirrors the operator's list, plus pages added since. */
const RESERVED_SLUGS = new Set(["admin", "api", "bookings", "builder", "checkout", "chinor", "owner", "start"]);
const COOLDOWN_MS = 60_000;
const DEFAULT_MAX_BUSINESSES = 3;

const lastCreation = new Map<number, number>();

export function maxBusinessesPerOwner(): number {
  const raw = Number.parseInt(process.env.VORTALY_MAX_BUSINESSES_PER_OWNER ?? "", 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_MAX_BUSINESSES;
}

/** Test hook: forget the per-instance cooldown. */
export function resetCreationCooldown(): void {
  lastCreation.clear();
}

export interface StartInput {
  name: string;
  phone: string;
  brief: string;
  telegramId: number;
}

export type StartResult =
  | { ok: true; slug: string; origin: "ai" | "template" }
  | {
      ok: false;
      reason: "invalid" | "limit_reached" | "too_fast" | "unavailable";
      field?: "name" | "phone" | "brief";
    };

/** First free slug for a name: `name`, then `name-2` … `name-9`. */
async function freeSlug(name: string): Promise<string | null> {
  let base = slugFor(name);
  if (RESERVED_SLUGS.has(base) || !isValidSlug(base)) base = `${base}-biz`.replace(/^-+/, "");
  if (!isValidSlug(base)) base = slugFor("");

  const local = localOnlyMode();
  for (let attempt = 1; attempt <= 9; attempt += 1) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;
    if (local) {
      if (!(await fileSiteExists(candidate))) return candidate;
      continue;
    }
    const lookup = await findSalonBySlug(candidate);
    if (lookup.unavailable) return null;
    if (!lookup.found) return candidate;
  }
  // Nine businesses with one name: fall back to a random suffix.
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function startBusiness(input: StartInput, now: number = Date.now()): Promise<StartResult> {
  const name = input.name.replace(/\s+/g, " ").trim();
  const brief = input.brief.replace(/\s+/g, " ").trim();
  const phone = cleanPhone(input.phone);
  if (name.length < 2 || name.length > 60) return { ok: false, reason: "invalid", field: "name" };
  if (!phone) return { ok: false, reason: "invalid", field: "phone" };
  if (brief.length < 8 || brief.length > 1500) return { ok: false, reason: "invalid", field: "brief" };

  const owned = await ownedSlugs(input.telegramId);
  if (owned === null) return { ok: false, reason: "unavailable" };
  if (owned.length >= maxBusinessesPerOwner()) return { ok: false, reason: "limit_reached" };

  const last = lastCreation.get(input.telegramId);
  if (last !== undefined && now - last < COOLDOWN_MS) return { ok: false, reason: "too_fast" };
  lastCreation.set(input.telegramId, now);

  const result = await build(name, phone, brief, input.telegramId);
  // A creation that failed should not make the owner wait a minute to retry.
  if (!result.ok) lastCreation.delete(input.telegramId);
  return result;
}

async function build(name: string, phone: string, brief: string, telegramId: number): Promise<StartResult> {
  const slug = await freeSlug(name);
  if (!slug) return { ok: false, reason: "unavailable" };

  // The tenant row. Without a database (local trial) the site is a local draft only.
  if (!localOnlyMode()) {
    const created = await createSalon({
      name,
      taglineRu: "Запись онлайн",
      taglineUz: "Onlayn yozilish",
      addressRu: "",
      addressUz: "",
      phone: `+998${phone}`,
      slug,
    });
    if (!created.persisted || created.slug !== slug) return { ok: false, reason: "unavailable" };
  }

  // Linked before the build: if the draft cannot be saved, the owner can still
  // open their builder and generate again from there.
  if (!(await linkOwner(slug, telegramId))) return { ok: false, reason: "unavailable" };

  const generated = await generateSpec({ slug, name, phone, kind: detectKind(brief), brief });
  const saved = await saveDraft(slug, generated.spec);
  if (!saved.ok) return { ok: false, reason: "unavailable" };
  if (generated.origin === "ai") await recordFreeUse(slug);

  return { ok: true, slug, origin: generated.origin };
}
