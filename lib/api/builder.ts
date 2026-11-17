import type { SiteSpec } from "@/lib/builder/spec";
import type { Translated } from "@/lib/types";

/**
 * Browser-side client for /api/builder/*. Like lib/api/salons.ts it knows no
 * secret: the browser is authorised by the httpOnly admin session cookie.
 */

export interface SiteView {
  slug: string;
  draft: SiteSpec;
  published: SiteSpec | null;
  updatedAt: string;
  publishedAt: string | null;
  /** `file` means a development-only local draft, not the database. */
  storage: "supabase" | "file";
}

export type LoadSite =
  | { status: "ok"; site: SiteView }
  | { status: "unauthorized" }
  /** The tenant exists but nothing has been generated for it yet. */
  | { status: "no_site"; tenant: { name: string; phone: string } }
  | { status: "not_found" }
  | { status: "error" };

async function parse(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function fetchSite(slug: string): Promise<LoadSite> {
  try {
    const response = await fetch(`/api/builder/${slug}`, { cache: "no-store" });
    const body = await parse(response);
    if (response.ok) return { status: "ok", site: body.site as SiteView };
    if (response.status === 401) return { status: "unauthorized" };
    if (response.status === 404 && body.error === "site_not_found" && body.tenant) {
      return { status: "no_site", tenant: body.tenant as { name: string; phone: string } };
    }
    if (response.status === 404) return { status: "not_found" };
    return { status: "error" };
  } catch {
    return { status: "error" };
  }
}

export type Failure = "unauthorized" | "ai" | "key_required" | "key_rejected" | "schema" | "error";

function failureOf(response: Response, body: Record<string, unknown>): Failure {
  if (response.status === 401) return "unauthorized";
  if (body.error === "ai_key_required") return "key_required";
  if (body.error === "ai_key_rejected") return "key_rejected";
  if (body.error === "ai_unavailable") return "ai";
  if (body.error === "schema_missing") return "schema";
  return "error";
}

export async function saveSpec(
  slug: string,
  spec: SiteSpec,
): Promise<{ ok: true; site: SiteView } | { ok: false; reason: Failure }> {
  try {
    const response = await fetch(`/api/builder/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spec }),
    });
    const body = await parse(response);
    if (response.ok) return { ok: true, site: body.site as SiteView };
    return { ok: false, reason: failureOf(response, body) };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export async function aiEdit(
  slug: string,
  instruction: string,
): Promise<
  | { ok: true; changed: boolean; reply: Translated; spec: SiteSpec }
  | { ok: false; reason: Failure }
> {
  try {
    const response = await fetch(`/api/builder/${slug}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction }),
    });
    const body = await parse(response);
    if (response.ok) {
      return {
        ok: true,
        changed: body.changed === true,
        reply: body.reply as Translated,
        spec: body.spec as SiteSpec,
      };
    }
    return { ok: false, reason: failureOf(response, body) };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export type StaffWarning = "no_database" | "no_tenant" | "unavailable";

export async function publishSite(
  slug: string,
): Promise<
  | { ok: true; site: SiteView; staffSynced: boolean; staffWarning?: StaffWarning }
  | { ok: false; reason: Failure }
> {
  try {
    const response = await fetch(`/api/builder/${slug}/publish`, { method: "POST" });
    const body = await parse(response);
    if (response.ok) {
      return {
        ok: true,
        site: body.site as SiteView,
        staffSynced: body.staffSynced === true,
        staffWarning: body.staffWarning as StaffWarning | undefined,
      };
    }
    return { ok: false, reason: failureOf(response, body) };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export async function generateSite(
  slug: string,
  brief: string,
): Promise<{ ok: true; origin: "ai" | "template" } | { ok: false; reason: Failure }> {
  try {
    const response = await fetch(`/api/builder/${slug}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief }),
    });
    const body = await parse(response);
    if (response.ok) return { ok: true, origin: body.origin === "ai" ? "ai" : "template" };
    return { ok: false, reason: failureOf(response, body) };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/* --------------------------------------------------------- AI allowance --- */

export type OwnKeyProvider = "gemini" | "groq" | "openrouter";

export interface AiStatusView {
  freeLimit: number;
  freeUsed: number;
  freeLeft: number;
  ownKey: { provider: OwnKeyProvider; hint: string; addedAt: string | null } | null;
  ownKeysEnabled: boolean;
}

export type KeyFailure =
  | "unauthorized"
  | "invalid_key"
  | "key_rejected"
  | "provider_unreachable"
  | "own_keys_disabled"
  | "error";

export async function fetchAiStatus(slug: string): Promise<AiStatusView | null> {
  try {
    const response = await fetch(`/api/builder/${slug}/ai`, { cache: "no-store" });
    if (!response.ok) return null;
    return ((await parse(response)).ai as AiStatusView) ?? null;
  } catch {
    return null;
  }
}

async function changeKey(
  slug: string,
  init: RequestInit,
): Promise<{ ok: true; ai: AiStatusView } | { ok: false; reason: KeyFailure }> {
  try {
    const response = await fetch(`/api/builder/${slug}/ai`, init);
    const body = await parse(response);
    if (response.ok) return { ok: true, ai: body.ai as AiStatusView };
    if (response.status === 401) return { ok: false, reason: "unauthorized" };
    const known: KeyFailure[] = ["invalid_key", "key_rejected", "provider_unreachable", "own_keys_disabled"];
    const reason = known.find((code) => code === body.error);
    return { ok: false, reason: reason ?? (body.error === "invalid_provider" ? "invalid_key" : "error") };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** The key goes to the server once and is never sent back. */
export function saveOwnKey(slug: string, provider: OwnKeyProvider, key: string) {
  return changeKey(slug, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, key }),
  });
}

export function removeOwnKey(slug: string) {
  return changeKey(slug, { method: "DELETE" });
}
