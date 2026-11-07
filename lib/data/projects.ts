import type { Translated } from "@/lib/types";

/**
 * Meta-platform demo data: the tenant projects running on uzmini.uz and the
 * agent pipeline that builds a new one.
 *
 * Replace PROJECTS with a Supabase query once the platform tables exist; the
 * pipeline stays client-side because it only narrates what the agents are
 * doing — the real progress will arrive over a socket or SSE stream.
 */

export type ProjectStatus = "live" | "building" | "queued" | "paused" | "failed";

export type ProjectKind = "salon" | "cafe" | "carwash" | "custom";

export interface Project {
  /** Also the subdomain label and the local preview path. */
  id: string;
  name: string;
  kind: ProjectKind;
  status: ProjectStatus;
  /** Percent complete; only meaningful while building. */
  progress?: number;
  /** Minutes since the last agent touched it. */
  touchedMinutesAgo: number;
}

export const ROOT_DOMAIN = "uzmini.uz";

export function subdomainOf(project: Project): string {
  return `${project.id}.${ROOT_DOMAIN}`;
}

export const PROJECTS: Project[] = [
  { id: "chinor", name: "Chinor", kind: "salon", status: "live", touchedMinutesAgo: 4 },
  {
    id: "coffee",
    name: "Buxoro Coffee",
    kind: "cafe",
    status: "building",
    progress: 62,
    touchedMinutesAgo: 0,
  },
  { id: "oqtepa", name: "Oqtepa Avtomoyka", kind: "carwash", status: "queued", touchedMinutesAgo: 2 },
  { id: "lola", name: "Lola Gullari", kind: "custom", status: "paused", touchedMinutesAgo: 1440 },
  { id: "shifo", name: "Shifo Dental", kind: "custom", status: "failed", touchedMinutesAgo: 51 },
];

export function getProject(id: string): Project | undefined {
  return PROJECTS.find((p) => p.id === id);
}

/* ------------------------------------------------------------- templates --- */

export interface Template {
  kind: Exclude<ProjectKind, "custom">;
  /** Seeds tagline_ru / tagline_uz on the created tenant. */
  tagline: Translated;
}

export const TEMPLATES: Template[] = [
  {
    kind: "salon",
    tagline: {
      ru: "Салон красоты и барбершоп",
      uz: "Goʻzallik saloni va barbershop",
    },
  },
  {
    kind: "cafe",
    tagline: { ru: "Кофейня и завтраки", uz: "Qahvaxona va nonushta" },
  },
  {
    kind: "carwash",
    tagline: { ru: "Автомойка и детейлинг", uz: "Avtomoyka va detalling" },
  },
];

/* -------------------------------------------------------------- pipeline --- */

export type StageId = "schema" | "domain" | "ui" | "deploy";

export const STAGE_ORDER: StageId[] = ["schema", "domain", "ui", "deploy"];

export type LogLevel = "info" | "ok" | "warn";

export interface LogLine {
  stage: StageId;
  level: LogLevel;
  /**
   * Build output stays in the language agents actually log in. Translating
   * `create table` would make it harder to paste into a bug report, so only the
   * stage headings are localised.
   */
  text: string;
}
