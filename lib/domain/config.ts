/** Public host name used for the platform and its tenant subdomains. */
const configuredRootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.trim().toLowerCase();

export const ROOT_DOMAIN = (configuredRootDomain || "vortaly.com")
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "");

export const TENANT_SUFFIX = `.${ROOT_DOMAIN}`;

/**
 * Shared hosting domains that belong to everyone on the host, not to Vortaly.
 * If one of them is configured as the root by mistake (`vercel.app` instead of
 * `vortaly.vercel.app`), every other project on that host would look like one
 * of our tenants, and our own `vortaly.vercel.app` would resolve as a tenant
 * named "vortaly". Subdomain tenancy is switched off for these; tenants are
 * still reachable by path (`/<slug>`).
 */
const SHARED_HOSTING_ROOTS = [
  "vercel.app",
  "netlify.app",
  "web.app",
  "firebaseapp.com",
  "pages.dev",
  "onrender.com",
  "railway.app",
  "fly.dev",
];

export const TENANT_SUBDOMAINS_ENABLED = !SHARED_HOSTING_ROOTS.includes(ROOT_DOMAIN);

export function tenantHost(slug: string): string {
  return `${slug}.${ROOT_DOMAIN}`;
}

export function tenantUrl(slug: string): string {
  return `https://${tenantHost(slug)}`;
}
