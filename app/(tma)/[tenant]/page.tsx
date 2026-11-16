import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProject } from "@/lib/data/projects";
import { loadSite } from "@/lib/builder/store";
import {
  findSalonBySlug,
  findSalonBySlugFound,
  findSalonBySlugRecord,
  isValidSlug,
} from "@/lib/supabase/salons";
import { MiniApp } from "@/components/tma/MiniApp";
import { TenantPending } from "@/components/tma/TenantPending";
import { TenantSite } from "@/components/tma/TenantSite";

/**
 * A tenant's Mini App. In production each project answers on its own
 * subdomain (chinor.<ROOT_DOMAIN>); until wildcard DNS exists the same screens
 * are reachable at /<slug>, which is what the console and the builder link to.
 *
 * Resolution order: the built-in module, then a site published from the
 * builder, then a tenant that exists but has nothing published yet, then the
 * demo projects. Anything else is genuinely not a tenant.
 */

// Always rendered per request: publishing must show up on the next load.
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ tenant: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant } = await params;
  if (!isValidSlug(tenant) || tenant === "chinor") return {};

  const site = await loadSite(tenant);
  const published = site.status === "ok" ? site.site.published : null;
  if (!published) return {};

  return {
    title: `${published.name} — запись онлайн`,
    description: published.tagline.ru || published.about.ru || undefined,
  };
}

export default async function TenantPage({ params }: Props) {
  const { tenant } = await params;

  if (!isValidSlug(tenant)) notFound();

  // Chinor is the hand-built module.
  if (tenant === "chinor") return <MiniApp />;

  // Only the published copy is public. A draft is visible in the builder only.
  const site = await loadSite(tenant);
  if (site.status === "ok" && site.site.published) {
    return <TenantSite spec={site.site.published} />;
  }

  const building = (name: string) => (
    <TenantPending
      project={{ id: tenant, name, kind: "custom", status: "building", touchedMinutesAgo: 0 }}
    />
  );

  // A draft exists but was never published.
  if (site.status === "ok") return building(site.site.draft.name);

  const lookup = await findSalonBySlug(tenant);
  if (findSalonBySlugFound(lookup)) {
    return building(findSalonBySlugRecord(lookup)!.name);
  }

  const demo = getProject(tenant);
  if (demo) return <TenantPending project={demo} />;

  notFound();
}
