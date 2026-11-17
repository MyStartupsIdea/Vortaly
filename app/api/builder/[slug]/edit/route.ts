import { recordFreeUse, resolveAccess } from "@/lib/ai/access";
import { AiError } from "@/lib/ai/llm";
import { editSpec } from "@/lib/builder/generate";
import { guard, json, keyRequired, readObject, storageFailure } from "@/lib/builder/http";
import { loadSite, saveDraft } from "@/lib/builder/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A model round trip, with failover across providers.
export const maxDuration = 120;

/**
 * POST /api/builder/<slug>/edit   { instruction }
 *
 * The AI editor: one plain-language request in, a changed draft out. The model
 * only proposes operations from a closed list (lib/builder/spec.ts), they are
 * applied to the stored draft server-side, and the result is saved as the new
 * draft. Nothing here publishes.
 */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const guarded = await guard(request, context.params);
  if ("response" in guarded) return guarded.response;

  const body = await readObject(request);
  const instruction = typeof body?.instruction === "string" ? body.instruction.trim() : "";
  if (instruction.length < 3 || instruction.length > 1000) {
    return json({ error: "instruction must be 3 to 1000 characters" }, 400);
  }

  const current = await loadSite(guarded.slug);
  if (current.status === "unavailable") return storageFailure("unavailable");
  if (current.status === "missing") return storageFailure("missing");

  const access = await resolveAccess(guarded.slug);
  if (!access) return storageFailure("unavailable");
  if (access.mode === "key_required") return keyRequired();

  try {
    const result = await editSpec(
      current.site.draft,
      instruction,
      access.mode === "own" ? access.ownKey : undefined,
    );
    // The model answered on the platform's key: that is one free action,
    // whether or not the answer changed anything.
    if (access.mode === "free") await recordFreeUse(guarded.slug);

    if (result.applied === 0) {
      // Nothing changed, so nothing is written. The reply says why.
      return json({ changed: false, reply: result.reply, spec: current.site.draft });
    }

    const saved = await saveDraft(guarded.slug, result.spec);
    if (!saved.ok) return storageFailure(saved.reason);

    return json({ changed: true, reply: result.reply, spec: saved.site.draft });
  } catch (error) {
    // Closed code only: no provider status, body or message reaches the client.
    const code = error instanceof AiError ? error.code : "unavailable";
    console.warn("[builder/edit] failed:", code);
    if (code === "key_rejected") return json({ error: "ai_key_rejected" }, 502);
    return json({ error: "ai_unavailable", code }, 503);
  }
}
