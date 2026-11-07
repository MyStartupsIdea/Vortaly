import { notFound } from "next/navigation";
import { getProject } from "@/lib/data/projects";
import { findSalonBySlug, isValidSlug } from "@/lib/supabase/salons";
import { MiniApp } from "@/components/tma/MiniApp";
import { TenantPending } from "@/components/tma/TenantPending";

/**
 * A tenant's Mini App. In production each project answers on its own
 * subdomain (chinor.uzmini.uz); locally the same screens are reachable at
 * /chinor, /coffee and so on, which is what the console links to.
 *
 * Resolution order: the one module that exists, then the real salons table,
 * then the demo projects. Anything else is genuinely not a tenant.
 */
export default async function TenantPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;

  if (!isValidSlug(tenant)) notFound();

  // Chinor is the module that is actually built.
  if (tenant === "chinor") return <MiniApp />;

  const salon = await findSalonBySlug(tenant);
  if (salon) {
    return (
      <TenantPending
        project={{
          id: salon.id,
          name: salon.name,
          kind: "custom",
          status: "building",
          touchedMinutesAgo: 0,
        }}
      />
    );
  }

  const demo = getProject(tenant);
  if (demo) return <TenantPending project={demo} />;

  notFound();
}
