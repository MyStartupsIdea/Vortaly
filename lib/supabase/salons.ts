import { slugify } from "@/lib/translit";
import { getSupabaseServer } from "./server";

/**
 * Multi-tenant "platform tenant" = a salon (salon_id).
 *
 * Every entity in the schema already carries salon_id, so tenant resolution is
 * just: which salon does this subdomain belong to? The middleware resolves that
 * once and stashes the id on the request via the `x-salon-id` header so API
 * routes and server components never re-derive it from untrusted headers.
 */

export interface SalonRecord {
  id: string;
  name: string;
  tagline_ru: string;
  tagline_uz: string;
  address_ru: string;
  address_uz: string;
  phone: string;
  rating: number;
  review_count: number;
  open_from: string;
  open_to: string;
  created_at: string;
}

const TABLE = "salons";

/**
 * Look up a salon by its subdomain slug. Returns null when the slug does not
 * match any active salon (or when Supabase is not configured).
 */
export async function findSalonBySlug(slug: string): Promise<SalonRecord | null> {
  const db = getSupabaseServer();
  if (!db) return null;

  try {
    const { data, error } = await db
      .from(TABLE)
      .select("*")
      .eq("id", slug)
      .single<SalonRow>();

    if (error || !data) return null;
    return toRecord(data);
  } catch (err) {
    // Network errors (fetch failed, DNS, timeout) should not crash the
    // platform. Return null so the caller can fall back gracefully.
    const message = err instanceof Error ? err.message : String(err);
    if (isNetworkError(err)) {
      console.warn("[salons.findSalonBySlug] Supabase network error, degrading:", message);
    } else {
      console.error("[salons.findSalonBySlug] unexpected error:", message);
    }
    return null;
  }
}

interface SalonRow {
  id: string;
  name: string;
  tagline_ru: string;
  tagline_uz: string;
  address_ru: string;
  address_uz: string;
  phone: string;
  rating: number | null;
  review_count: number | null;
  open_from: string;
  open_to: string;
  created_at: string;
}

function toRecord(row: SalonRow): SalonRecord {
  return {
    id: row.id,
    name: row.name,
    tagline_ru: row.tagline_ru,
    tagline_uz: row.tagline_uz,
    address_ru: row.address_ru,
    address_uz: row.address_uz,
    phone: row.phone,
    rating: row.rating ?? 0,
    review_count: row.review_count ?? 0,
    open_from: row.open_from,
    open_to: row.open_to,
    created_at: row.created_at,
  };
}

/**
 * Create a new salon (a new tenant / mini-app project). The returned `slug` is
 * the canonical subdomain — point DNS for `<slug>.uzmini.uz` at the platform.
 *
 * Slugs are forced lowercase + ASCII-only so they make safe DNS labels.
 */
export async function createSalon(input: {
  name: string;
  taglineRu: string;
  taglineUz: string;
  addressRu: string;
  addressUz: string;
  phone: string;
  /** Suggested slug; if omitted, derived from `name`. */
  slug?: string;
}): Promise<{ slug: string; id: string; persisted: boolean; warning?: string }> {
  const db = getSupabaseServer();
  if (!db) {
    const slug = slugFor(input.slug ?? input.name);
    return { slug, id: slug, persisted: false, warning: "Supabase not configured" };
  }

  const slug = slugFor(input.slug ?? input.name);

  try {
    const { data, error } = await db
      .from(TABLE)
      .insert({
        id: slug,
        name: input.name,
        tagline_ru: input.taglineRu,
        tagline_uz: input.taglineUz,
        address_ru: input.addressRu,
        address_uz: input.addressUz,
        phone: input.phone,
      })
      .select("id")
      .single<Pick<SalonRow, "id">>();

    if (error) {
      return { slug, id: slug, persisted: false, warning: error.message };
    }

    return { slug, id: data.id, persisted: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isNetworkError(err)) {
      return {
        slug,
        id: slug,
        persisted: false,
        warning: "Supabase unavailable — salon was not created",
      };
    }
    console.error("[salons.createSalon] unexpected error:", message);
    return {
      slug,
      id: slug,
      persisted: false,
      warning: "Failed to create salon: " + message,
    };
  }
}

/**
 * Derives a DNS-safe, URL-safe salon slug from a proposed slug or a name.
 *
 * Rules:
 *  - lowercase ASCII only
 *  - hyphens and alphanumeric only
 *  - max 63 chars (DNS label limit)
 *  - no leading/trailing hyphens
 */
export function slugFor(proposed: string): string {
  // slugify transliterates Cyrillic first. Without that step a Russian name
  // produced a Cyrillic "label" that isValidSlug below rejects, so the tenant
  // was created but its subdomain could never resolve.
  const slug = slugify(proposed);
  if (slug) return slug;
  return "salon-" + Math.random().toString(36).slice(2, 10);
}

/**
 * Validate a subdomain slug as a DNS label.
 */
export function isValidSlug(slug: string): boolean {
  if (!slug || slug.length < 3 || slug.length > 63) return false;
  // No consecutive hyphens, no leading/trailing hyphens, only a-z0-9 and hyphen.
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

/**
 * Detailed slug validation for public endpoints. Returns a descriptive error
 * string (empty = valid) so the caller can return a helpful 400 response.
 */
export function validateSlug(slug: unknown): string {
  if (typeof slug !== "string" || slug.length === 0) {
    return "slug is required";
  }
  if (slug.length < 3) {
    return "slug must be at least 3 characters (e.g. chinor-tashkent)";
  }
  if (slug.length > 63) {
    return "slug must be at most 63 characters (DNS label limit)";
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return "slug may only contain lowercase letters, digits, and hyphens";
  }
  if (/-{2,}/.test(slug)) {
    return "slug must not contain consecutive hyphens (e.g. --)";
  }
  if (slug.startsWith("-") || slug.endsWith("-")) {
    return "slug must not start or end with a hyphen";
  }
  return "";
}


/**
 * Detects Supabase/network errors that should trigger graceful degradation
 * rather than a crash.
 *
 * Covers:
 *  - fetch failed (DNS resolution failure, connection refused, network down)
 *  - timeouts
 *  - HTTP 5xx from Supabase (service temporarily unavailable)
 *  - AbortError (request cancelled)
 *
 * Does NOT treat client errors (4xx from Supabase, e.g. uniqueness conflicts)
 * as network errors — those are intentional responses, not infrastructure faults.
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const name = error.name;
    const message = error.message.toLowerCase();

    // "fetch failed" is the classic signature of a network-level failure from
    // the fetch implementation used by the Supabase JS client.
    if (name === "TypeError" && message.includes("fetch failed")) return true;

    // Timeout / abort signals.
    if (name === "TimeoutError") return true;
    if (name === "AbortError") return true;
    if (message.includes("timeout")) return true;
    if (message.includes("abort")) return true;

    // "Failed to fetch" alias used by some runtime environments.
    if (message.includes("failed to fetch")) return true;

    // DNS resolution failures surface as TypeError in many environments.
    if (message.includes("dns") || message.includes("resolve")) return true;
    if (message.includes("econnrefused") || message.includes("connection refused")) return true;
    if (message.includes("network") || message.includes("networkerror")) return true;

    // Supabase JS may throw with a cause chain; check it too.
    if (error.cause instanceof Error) {
      return isNetworkError(error.cause);
    }
  }

  // unknown / non-Error throwables — treat conservatively as non-network so
  // the platform can still degrade instead of crashing.
  return false;
}
