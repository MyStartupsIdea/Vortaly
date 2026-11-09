import { slugify } from "@/lib/translit";
import { getSupabaseServer } from "./server";

/**
 * A bilingual string used across salon/profile labels and addresses. The
 * canonical shape is `Record<"ru"|"uz", string>`; import it from
 * `@/lib/types` so every consumer uses the same definition instead of a local
 * shape.
 */
import type { Translated } from "@/lib/types";

/**
 * Multi-tenant "platform tenant" = a salon (salon_id).
 * * Every entity in the schema already carries salon_id, so tenant resolution is
 * just: which salon does this subdomain belong to? The middleware resolves that
 * once and stashes the id on the request via the `x-salon-id` header so API
 * routes and server components never re-derive it from untrusted headers.
 */
export interface SalonRecord {
  id: string;
  name: string;
  tagline: Translated;
  address: Translated;
  phone: string;
  rating: number;
  reviewCount: number;
  openFrom: string;
  openTo: string;
  createdAt: string;
}

const TABLE = "salons";

/**
 * Look up a salon by its subdomain slug.
 *
 * Returns one of:
 *  - `{ found: true, record }` — the tenant exists.
 *  - `{ found: false, available: true }` — the slug is free (no row exists).
 *  - `{ found: false, available: false, unavailable: true }` — the database is
 *    unreachable or degraded, so we cannot say whether the slug is free.
 *
 * This is intentionally side-effect free: it does not write anything, it only
 * reads. The `slug` argument here comes exclusively from the host header path in
 * the middleware or from validated admin input; it is never taken from a
 * client-supplied booking payload or a payment callback.
 */
export async function findSalonBySlug(slug: string): Promise<FindSalonResult> {
  const db = getSupabaseServer();
  if (!db) {
    return { found: false, available: false, unavailable: true };
  }

  try {
    const { data, error } = await db
      .from(TABLE)
      .select("*")
      .eq("id", slug)
      .single<SalonRow>();

    if (error) {
      const code = typeof error.code === "string" ? error.code : undefined;
      if (code && /^5\d{2}$/.test(code)) {
        console.warn("[salons.findSalonBySlug] Supabase temporarily unavailable");
        return { found: false, available: false, unavailable: true };
      }
      return { found: false, available: true, unavailable: false };
    }

    if (!data) {
      return { found: false, available: true, unavailable: false };
    }

    return { found: true, record: toRecord(data), available: false, unavailable: false };
  } catch (err) {
    // Network errors (fetch failed, DNS, timeout) should not crash the
    // platform. We report them as unavailable so callers never mistake a
    // network fault for "slug is free".
    const msg = err instanceof Error ? err.message : String(err);
    if (isNetworkError(err)) {
      console.warn("[salons.findSalonBySlug] Supabase network error, degrading:", msg);
      return { found: false, available: false, unavailable: true };
    }
    console.error("[salons.findSalonBySlug] unexpected error:", msg);
    return { found: false, available: false, unavailable: true };
  }
}

/**
 * Result of a single-tenant lookup.
 */
export interface FindSalonResult {
  /** A salon row was found. */
  found: boolean;
  /** The database answered authoritatively and reported no row for this slug. */
  available: boolean;
  /** The database could not be reached or was degraded, so the answer is unknown. */
  unavailable: boolean;
  /** Present only when `found` is true. Only trusted callers need the full record. */
  record?: SalonRecord;
}

/**
 * Convenient check helpers built on top of the explicit result type.
 */
export function findSalonBySlugFound(result: FindSalonResult): boolean {
  return result.found;
}

export function findSalonBySlugAvailable(result: FindSalonResult): boolean {
  return result.available;
}

export function findSalonBySlugUnavailable(result: FindSalonResult): boolean {
  return result.unavailable;
}

export function findSalonBySlugRecord(result: FindSalonResult): SalonRecord | undefined {
  return result.record;
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
    tagline: { ru: row.tagline_ru, uz: row.tagline_uz },
    address: { ru: row.address_ru, uz: row.address_uz },
    phone: row.phone,
    rating: row.rating ?? 0,
    reviewCount: row.review_count ?? 0,
    openFrom: row.open_from,
    openTo: row.open_to,
    createdAt: row.created_at,
  };
}

/**
 * Create a new salon (a new tenant / mini-app project). The returned `slug` is
 * the canonical subdomain — point DNS for `<slug>.<ROOT_DOMAIN>` at the platform.
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
      .select("id").single<Pick<SalonRow, "id">>();    if (error) {
      // Network failures from the Supabase client surface as thrown errors,
      // but a missing table / constraint violation surfaces as `error`.
      // Distinguish infrastructure faults from validation failures.
      if ("code" in error) {
        const code = (error as { code?: unknown }).code;
        if (typeof code === "string" && /^5\d{2}$/.test(code)) {
          return {
            slug,
            id: slug,
            persisted: false,
            warning: "Supabase temporarily unavailable",
          };
        }
      }
      return { slug, id: slug, persisted: false, warning: "Insert failed on Supabase" };
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
 * HTTP 5xx responses from the Supabase JS client can surface either as an Error
 * whose message starts with the HTTP status code (e.g. "503: Service
 * Unavailable") or as an Error whose `code` field is the numeric status string
 * (e.g. "503"). Both are treated as infrastructure faults so the platform degrades
 * instead of surfacing a 5xx-backed crash to callers.
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

    // HTTP 5xx from Supabase itself — the service is temporarily degraded.
    // Supabase JS can surface the server error either with a leading HTTP status
    // in the message (e.g. "500: ...") or as the numeric `code` field (e.g.
    // "500"). Both forms are infrastructure faults, so callers degrade.
    if (/^5\d{2}/.test(message)) return true;
    if ("code" in error) {
      const code = (error as { code?: unknown }).code;
      if (typeof code === "string" && /^5\d{2}$/.test(code)) return true;
    }

    // Supabase JS may throw with a cause chain; check it too.
    if ("cause" in error && error.cause instanceof Error) {
      return isNetworkError(error.cause);
    }
  }

  // unknown / non-Error throwables — treat conservatively as non-network so
  // the platform can still degrade instead of crashing.
  return false;
}
