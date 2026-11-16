import { guard, json, readObject, storageFailure } from "@/lib/builder/http";
import { sanitizeSpec } from "@/lib/builder/spec";
import { loadSite, saveDraft, type SiteRecord } from "@/lib/builder/store";
import { findSalonBySlug } from "@/lib/supabase/salons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What the builder UI needs to know about a site. */
function view(site: SiteRecord) {
  return {
    slug: site.slug,
    draft: site.draft,
    published: site.published,
    updatedAt: site.updatedAt,
    publishedAt: site.publishedAt,
    storage: site.storage,
  };
}

/**
 * GET /api/builder/<slug>
 *
 * The site as the builder sees it: the draft, and the published copy if any.
 * A tenant that exists but has no site yet answers 404 with the tenant's name
 * and phone, so the builder can offer to generate one.
 */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const guarded = await guard(request, context.params);
  if ("response" in guarded) return guarded.response;

  const site = await loadSite(guarded.slug);
  if (site.status === "unavailable") return storageFailure("unavailable");
  if (site.status === "ok") return json({ site: view(site.site) });

  const lookup = await findSalonBySlug(guarded.slug);
  if (lookup.found && lookup.record) {
    return json(
      {
        error: "site_not_found",
        tenant: { name: lookup.record.name, phone: lookup.record.phone },
      },
      404,
    );
  }
  return json({ error: "tenant_not_found" }, 404);
}

/**
 * PUT /api/builder/<slug>   { spec }
 *
 * Saves a hand-edited draft. The body is sanitized against the stored site's
 * identity, so the slug cannot be changed and ids stay in the tenant's own
 * namespace whatever the browser sent.
 */
export async function PUT(request: Request, context: { params: Promise<{ slug: string }> }) {
  const guarded = await guard(request, context.params);
  if ("response" in guarded) return guarded.response;

  const body = await readObject(request);
  if (!body || !body.spec || typeof body.spec !== "object") {
    return json({ error: "spec is required" }, 400);
  }

  const current = await loadSite(guarded.slug);
  if (current.status === "unavailable") return storageFailure("unavailable");
  if (current.status === "missing") return storageFailure("missing");

  const previous = current.site.draft;
  const spec = sanitizeSpec(body.spec, {
    slug: guarded.slug,
    name: previous.name,
    phone: previous.phone,
    kind: previous.kind,
  });

  const saved = await saveDraft(guarded.slug, { ...spec, kind: previous.kind });
  if (!saved.ok) return storageFailure(saved.reason);

  return json({ site: view(saved.site) });
}
