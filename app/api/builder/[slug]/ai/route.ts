import { aiStatus, plausibleKey, removeOwnKey, storeOwnKey } from "@/lib/ai/access";
import { checkOwnKey, isOwnKeyProvider } from "@/lib/ai/llm";
import { guard, json, readObject, storageFailure } from "@/lib/builder/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/builder/<slug>/ai — the site's AI allowance and its own key.
 *
 *   GET     how many free actions are left, and which key (if any) is set
 *   PUT     { provider, key }  check the key with its provider, then store it
 *   DELETE  forget the key; the site falls back to what is left of its allowance
 *
 * The key travels browser -> server once, on PUT. No response ever carries it
 * back: only the provider and its last four characters.
 */

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const guarded = await guard(request, context.params);
  if ("response" in guarded) return guarded.response;

  const status = await aiStatus(guarded.slug);
  if (!status) return storageFailure("unavailable");
  return json({ ai: status });
}

export async function PUT(request: Request, context: { params: Promise<{ slug: string }> }) {
  const guarded = await guard(request, context.params);
  if ("response" in guarded) return guarded.response;

  const body = await readObject(request);
  const provider = body?.provider;
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!isOwnKeyProvider(provider)) return json({ error: "invalid_provider" }, 400);
  if (!plausibleKey(key)) return json({ error: "invalid_key" }, 400);

  const check = await checkOwnKey({ provider, key });
  if (check === "rejected") return json({ error: "key_rejected" }, 422);
  if (check === "unreachable") return json({ error: "provider_unreachable" }, 502);

  const stored = await storeOwnKey(guarded.slug, { provider, key });
  if (stored === "disabled") return json({ error: "own_keys_disabled" }, 503);
  if (stored === "unavailable") return storageFailure("unavailable");

  const status = await aiStatus(guarded.slug);
  return json({ ai: status });
}

export async function DELETE(request: Request, context: { params: Promise<{ slug: string }> }) {
  const guarded = await guard(request, context.params);
  if ("response" in guarded) return guarded.response;

  if (!(await removeOwnKey(guarded.slug))) return storageFailure("unavailable");
  const status = await aiStatus(guarded.slug);
  return json({ ai: status });
}
