/** Public host name used for the platform and its tenant subdomains. */
const configuredRootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.trim().toLowerCase();

export const ROOT_DOMAIN = (configuredRootDomain || "vortaly.com")
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "");

export const TENANT_SUFFIX = `.${ROOT_DOMAIN}`;

export function tenantHost(slug: string): string {
  return `${slug}.${ROOT_DOMAIN}`;
}

export function tenantUrl(slug: string): string {
  return `https://${tenantHost(slug)}`;
}
