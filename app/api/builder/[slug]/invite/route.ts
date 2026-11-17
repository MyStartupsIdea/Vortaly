import { guard, json, storageFailure } from "@/lib/builder/http";
import { createInvite } from "@/lib/owner/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/builder/<slug>/invite
 *
 * The platform operator creates a one-time link that makes whoever opens it
 * (and signs in with Telegram) the owner of this business. Valid for 7 days.
 * Owners cannot invite: only the operator decides who owns a business.
 *
 * The code is returned once, here; the server keeps only its hash.
 */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const guarded = await guard(request, context.params);
  if ("response" in guarded) return guarded.response;
  if (guarded.viewer !== "admin") return json({ error: "access denied" }, 403);

  const invite = await createInvite(guarded.slug);
  if (!invite) return storageFailure("unavailable");

  const origin = new URL(request.url).origin;
  return json({
    url: `${origin}/owner?invite=${encodeURIComponent(invite.code)}`,
    expiresAt: invite.expiresAt,
  });
}
