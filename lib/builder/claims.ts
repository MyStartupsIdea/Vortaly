import type { SiteSpec } from "@/lib/builder/spec";
import type { Translated } from "@/lib/types";

/**
 * Removes praise the owner never claimed from an AI-written site.
 *
 * Models add "experienced masters", "guaranteed results", "the best coffee in
 * town" to almost any page, whatever the prompt says. On a real business's
 * site that is the owner making a promise they did not make, and in some
 * trades (clinics, schools) a claim they may not be allowed to make. So the
 * rule in the prompt is backed by code: a claim group is allowed only when
 * the owner's own description uses it.
 *
 * What goes: a highlight that carries such a claim, and any sentence of the
 * "about" text that does. Prices, services, hours and staff are not touched.
 */

/** Stems by meaning, Russian and Uzbek (Latin). Lowercase, matched as substrings. */
const CLAIM_GROUPS: string[][] = [
  // experience
  ["опытн", "многолетн", "стаж", "tajriba", "tajribali"],
  // professional / qualified
  ["профессионал", "квалифицирован", "professional", "malakali"],
  // best / leading
  ["лучш", "№1", "номер один", "лидер", "eng yaxshi", "yetakchi"],
  // guarantees
  ["гарант", "kafolat"],
  // quality / premium
  ["качествен", "высокого качества", "премиальн", "премиум", "sifatli", "yuqori sifat"],
  // certified / licensed
  ["сертифицир", "лицензирован", "дипломирован", "sertifikat", "litsenziya"],
];

function backedGroups(brief: string): boolean[] {
  const text = brief.toLowerCase();
  return CLAIM_GROUPS.map((stems) => stems.some((stem) => text.includes(stem)));
}

function carriesUnbackedClaim(text: string, backed: boolean[]): boolean {
  const lower = text.toLowerCase();
  return CLAIM_GROUPS.some((stems, i) => !backed[i] && stems.some((stem) => lower.includes(stem)));
}

/** Sentences end at . ! ? or a line break; the punctuation stays with its sentence. */
function dropClaimSentences(text: string, backed: boolean[]): string {
  const sentences = text.match(/[^.!?\n]+[.!?]*\s*/g) ?? [];
  return sentences
    .filter((sentence) => !carriesUnbackedClaim(sentence, backed))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripUnbackedClaims(spec: SiteSpec, brief: string): SiteSpec {
  const backed = backedGroups(brief);

  const highlights = spec.highlights.filter(
    (pair) => !carriesUnbackedClaim(pair.ru, backed) && !carriesUnbackedClaim(pair.uz, backed),
  );

  const about: Translated = {
    ru: dropClaimSentences(spec.about.ru, backed),
    uz: dropClaimSentences(spec.about.uz, backed),
  };
  // If one language lost everything, keep the page bilingual rather than half-empty.
  if (!about.ru || !about.uz) {
    about.ru = about.ru && about.uz ? about.ru : "";
    about.uz = about.ru ? about.uz : "";
  }

  const tagline = carriesUnbackedClaim(`${spec.tagline.ru} ${spec.tagline.uz}`, backed)
    ? { ru: "", uz: "" }
    : spec.tagline;

  return { ...spec, highlights, about, tagline };
}
