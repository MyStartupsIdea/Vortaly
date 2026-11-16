import { guard, json, storageFailure } from "@/lib/builder/http";
import { publishSite } from "@/lib/builder/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/builder/<slug>/publish
 *
 * Makes the current draft the public page at /<slug>, and mirrors its staff
 * into `masters` so bookings can reference them. `staffSynced: false` means
 * the page is live but cannot take bookings yet, and `staffWarning` says why.
 */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const guarded = await guard(request, context.params);
  if ("response" in guarded) return guarded.response;

  const published = await publishSite(guarded.slug);
  if (!published.ok) return storageFailure(published.reason);

  const { site, staffSynced, staffWarning } = published.result;
  return json({
    site: {
      slug: site.slug,
      draft: site.draft,
      published: site.published,
      updatedAt: site.updatedAt,
      publishedAt: site.publishedAt,
      storage: site.storage,
    },
    staffSynced,
    staffWarning,
  });
}
