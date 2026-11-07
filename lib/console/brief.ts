import type { ProjectKind } from "@/lib/data/projects";

/**
 * Reads a plain-language brief typed into the command centre and pulls out the
 * few facts provisioning actually needs: what kind of business it is, what it
 * is called, and the phone number to reach it on.
 *
 * This is deliberately a parser, not a model. Nothing here calls an LLM, so it
 * can run on every keystroke and the console can show what it understood while
 * the operator is still typing. Whatever it cannot find stays empty, and the
 * form asks for it outright rather than inventing a value.
 */

export interface Brief {
  kind: ProjectKind;
  /** Empty when the brief carries no recognisable business name. */
  name: string;
  /** Nine national digits, without the +998 country code. Empty if absent. */
  phoneNational: string;
}

/**
 * Stems, not whole words, so one entry covers a whole inflected family:
 * "кофейня / кофейню / кофейни" all reduce to `кофейн`. Russian, Uzbek Latin
 * and English sit in one list because operators mix all three in a sentence.
 *
 * Order matters: the first family found wins, and the narrower trades come
 * first so "автомойка с кафе" is provisioned as a car wash.
 */
const KIND_STEMS: Array<[ProjectKind, string[]]> = [
  [
    "carwash",
    [
      "автомойк", "автомой", "мойк", "детейлинг", "шиномонтаж",
      "avtomoyk", "moyk", "detailing", "carwash", "car wash",
    ],
  ],
  [
    "cafe",
    [
      "кофейн", "кофе", "кафе", "ресторан", "пицц", "столов", "чайхан",
      "завтрак", "меню", "выпечк", "кондитер", "бургер", "суши",
      "qahvaxon", "qahva", "kafe", "restoran", "oshxon", "choyxon", "nonvoy",
      "coffee", "cafe", "restaurant", "pizzeria", "bakery", "canteen",
    ],
  ],
  [
    "salon",
    [
      "салон", "барбершоп", "барбер", "парикмахер", "красот", "маникюр",
      "педикюр", "стрижк", "ногт", "бров", "ресниц", "космет", "спа",
      "salon", "barbershop", "barber", "sartarosh", "goʻzallik", "gozallik",
      "manikyur", "soch", "beauty", "spa", "nails", "haircut",
    ],
  ],
];

/**
 * Stems of words that open a sentence or name the trade rather than the
 * business: "Кофейня Лола" is a cafe called Лола, and "Нужен мини-апп для
 * Lola Gullari" names no business until "Lola". Matched as prefixes, so
 * inflections come along for free, and shed from the front of a candidate
 * rather than discarding it — whatever follows is still a usable name.
 */
const TRADE_OR_FILLER_STEMS = [
  // The trade itself.
  "салон", "кофейн", "кафе", "ресторан", "автомойк", "мойк", "барбершоп",
  "барбер", "парикмахер", "пицц", "чайхан", "столов", "детейлинг", "магазин",
  "salon", "coffee", "cafe", "barbershop", "barber", "carwash", "avtomoyk",
  "qahvaxon", "restoran", "oshxon", "dokon", "magazin",
  // How briefs tend to start.
  "нужен", "нужна", "нужно", "сдела", "созда", "собер", "собра", "хочу",
  "давай", "запуст", "добав", "построй", "новый", "новая",
  "kerak", "yarat", "qil", "yangi", "menga",
  "need", "make", "build", "create", "want", "new",
];

/**
 * Cities, districts and platform names. These are only ruled out when they are
 * the whole candidate: "в Чиланзаре" is a location, while "Buxoro Coffee" is
 * genuinely what a business is called, so a multi-word run keeps them.
 */
const PLACE_OR_TECH_STEMS = [
  "ташкент", "тошкент", "чиланзар", "самарканд", "бухар", "наманган",
  "ферган", "андижан", "юнусабад", "сергел", "нукус", "хива",
  "toshkent", "tashkent", "chilonzor", "samarqand", "buxoro", "xiva",
  "payme", "click", "uzum", "telegram", "supabase", "uzmini",
  "mini", "app", "ilova", "bot", "ai",
];

function startsWithAny(word: string, stems: string[]): boolean {
  const lower = word.toLowerCase();
  return stems.some((stem) => lower.startsWith(stem));
}

/** A quoted run is the clearest possible signal: «Зарнигор», "Chinor". */
const QUOTED = /[«"'“‘]([^«»"'“”‘’]{2,40})[»"'”’]/u;

/**
 * A capitalised word, or a short run of them. Sentences start capitalised too,
 * so a match is only trusted once the stop-lists above have cleared it —
 * that is what keeps "Кофейня в Чиланзаре" from being read as a business
 * called "Кофейня", while still finding the name in "Chinor барбершоп".
 */
const CAPITALISED = /[\p{Lu}][\p{L}ʻ’'-]+(?:\s+[\p{Lu}][\p{L}ʻ’'-]+){0,2}/gu;

/**
 * +998 90 123 45 67, 998901234567, 90 123 45 67 and 901234567 all land on the
 * same nine digits. The country code is optional because most people type the
 * local form; the lookarounds stop a nine-digit window being carved out of a
 * longer number.
 */
const PHONE = /(?<!\d)(?:\+?998[\s-]?)?\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\d)/u;

export function detectKind(text: string): ProjectKind {
  const haystack = text.toLowerCase();
  for (const [kind, stems] of KIND_STEMS) {
    if (stems.some((stem) => haystack.includes(stem))) return kind;
  }
  return "custom";
}

export function detectPhone(text: string): string {
  const match = PHONE.exec(text);
  if (!match) return "";
  const digits = match[0].replace(/\D/g, "").replace(/^998/, "");
  return digits.length === 9 ? digits : "";
}

export function detectName(text: string): string {
  // The phone goes first so its digit groups cannot be read as part of a name.
  const withoutPhone = text.replace(PHONE, " ");

  const quoted = QUOTED.exec(withoutPhone);
  if (quoted) {
    const candidate = quoted[1].trim();
    if (candidate && !startsWithAny(candidate, TRADE_OR_FILLER_STEMS)) return candidate;
  }

  for (const match of withoutPhone.matchAll(CAPITALISED)) {
    const words = match[0].trim().split(/\s+/);
    while (words.length > 0 && startsWithAny(words[0], TRADE_OR_FILLER_STEMS)) words.shift();
    if (words.length === 0) continue;
    // A lone place or platform name is not what the business is called.
    if (words.length === 1 && startsWithAny(words[0], PLACE_OR_TECH_STEMS)) continue;
    return words.join(" ");
  }

  return "";
}

export function readBrief(text: string): Brief {
  return {
    kind: detectKind(text),
    name: detectName(text),
    phoneNational: detectPhone(text),
  };
}
