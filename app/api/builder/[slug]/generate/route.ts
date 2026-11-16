import { detectKind } from "@/lib/console/brief";
import { generateSpec } from "@/lib/builder/generate";
import { guard, json, readObject, storageFailure } from "@/lib/builder/http";
import { cleanPhone } from "@/lib/builder/spec";
import { loadSite, saveDraft } from "@/lib/builder/store";
import { findSalonBySlug } from "@/lib/supabase/salons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/builder/<slug>/generate   { brief }
 *
 * Writes a fresh draft for a tenant that already exists: one created before
 * the builder, or one whose draft the operator wants to start over. Name and
 * phone come from the stored tenant, never from the request or the model.
 *
 * Replaces the draft only. A published page stays as it is until the operator
 * publishes again.
 */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const guarded = await guard(request, context.params);
  if ("response" in guarded) return guarded.response;

  const body = await readObject(request);
  const brief = typeof body?.brief === "string" ? body.brief.trim() : "";
  if (brief.length < 8 || brief.length > 1500) {
    return json({ error: "brief must be 8 to 1500 characters" }, 400);
  }

  // Identity: the existing draft if there is one, else the tenant row.
  const current = await loadSite(guarded.slug);
  if (current.status === "unavailable") return storageFailure("unavailable");

  let name: string;
  let phone: string;
  if (current.status === "ok") {
    name = current.site.draft.name;
    phone = current.site.draft.phone;
  } else {
    const lookup = await findSalonBySlug(guarded.slug);
    if (lookup.unavailable) return storageFailure("unavailable");
    if (!lookup.found || !lookup.record) return storageFailure("no_tenant");
    name = lookup.record.name;
    phone = cleanPhone(lookup.record.phone);
  }

  const detected = detectKind(brief);
  const kind =
    detected !== "custom" ? detected : current.status === "ok" ? current.site.draft.kind : "custom";

  const generated = await generateSpec({ slug: guarded.slug, name, phone, kind, brief });

  const saved = await saveDraft(guarded.slug, generated.spec);
  if (!saved.ok) return storageFailure(saved.reason);

  return json({
    spec: saved.site.draft,
    origin: generated.origin,
    model: generated.model,
    failure: generated.failure,
    storage: saved.site.storage,
  });
}
