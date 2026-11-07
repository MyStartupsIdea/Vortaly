/**
 * Cyrillic to Latin, for turning a business name into a DNS label.
 *
 * Businesses here are named in Russian or Uzbek, and a subdomain has to be an
 * ASCII DNS label, so "Салон Зарнигор" must become "salon-zarnigor" rather than
 * being stripped to nothing or kept as Cyrillic.
 */
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  // Uzbek Cyrillic extras.
  ў: "o", қ: "q", ғ: "g", ҳ: "h",
};

export function transliterate(input: string): string {
  return Array.from(input.toLowerCase())
    .map((char) => CYRILLIC_TO_LATIN[char] ?? char)
    .join("");
}

/**
 * Apostrophes and modifier letters join their neighbours instead of splitting
 * them, so Uzbek "Gʻuncha" slugs as "guncha" rather than "g-uncha".
 */
const JOINERS = /['’ʻʼ`´]/g;

/**
 * A DNS-safe label: lowercase ASCII letters, digits and single hyphens, with no
 * hyphen at either end, capped at the 63-character DNS limit.
 *
 * Idempotent — slugify(slugify(x)) === slugify(x) — which matters because the
 * value travels through more than one layer before it becomes a subdomain.
 *
 * Returns an empty string when the input holds no usable characters; the caller
 * decides the fallback.
 */
export function slugify(input: string): string {
  return (
    transliterate(input)
      // Decompose accents, then drop the combining marks they leave behind.
      .normalize("NFKD")
      .replace(/\p{M}+/gu, "")
      // NFKD can reintroduce capitals (№ -> No), so fold case again.
      .toLowerCase()
      .replace(JOINERS, "")
      // Everything else that is not a letter or a digit separates words. An
      // existing hyphen survives as itself, which is what keeps this idempotent.
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 63)
      .replace(/^-+|-+$/g, "")
  );
}
