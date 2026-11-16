import type { ProjectKind } from "@/lib/data/projects";
import type { Translated } from "@/lib/types";

/**
 * The site specification: everything a generated business page is made of.
 *
 * One tenant = one `SiteSpec`. The AI writes it, the operator edits it, the
 * tenant page renders it and the booking API prices from it. There is no
 * generated code anywhere: a spec is plain data, so nothing a model returns can
 * execute, and a spec that passed `sanitizeSpec` is always renderable.
 *
 * This module is isomorphic (no server-only imports): the builder UI uses the
 * same types, id rules and operations as the server.
 */

export type ThemeId = "turquoise" | "pomegranate" | "saffron" | "petrol" | "plum" | "graphite";

export interface ThemeDef {
  id: ThemeId;
  /** Buttons, selected states, links. Always carries white text. */
  brand: string;
  /** The header band. Always carries porcelain text. */
  header: string;
  /** The one loud colour: the chosen time slot. */
  accent: string;
  /** Four glazed tiles repeated along the header's lower edge. */
  tiles: [string, string, string, string];
  label: Translated;
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  turquoise: {
    id: "turquoise",
    brand: "#0e7c86",
    header: "#0f2e2c",
    accent: "#b2322b",
    tiles: ["#0e7c86", "#e0a32e", "#0e7c86", "#b2322b"],
    label: { ru: "Бирюза", uz: "Firuza" },
  },
  pomegranate: {
    id: "pomegranate",
    brand: "#a8322c",
    header: "#35130f",
    accent: "#0e7c86",
    tiles: ["#b2322b", "#e0a32e", "#b2322b", "#0e7c86"],
    label: { ru: "Гранат", uz: "Anor" },
  },
  saffron: {
    id: "saffron",
    brand: "#a66a0c",
    header: "#2e2208",
    accent: "#b2322b",
    tiles: ["#e0a32e", "#0e7c86", "#e0a32e", "#b2322b"],
    label: { ru: "Шафран", uz: "Zaʼfaron" },
  },
  petrol: {
    id: "petrol",
    brand: "#1f4b45",
    header: "#0b1f1e",
    accent: "#b2322b",
    tiles: ["#1f4b45", "#e0a32e", "#1f4b45", "#0e7c86"],
    label: { ru: "Тёмная зелень", uz: "Toʻq yashil" },
  },
  plum: {
    id: "plum",
    brand: "#7a3b69",
    header: "#281324",
    accent: "#b2322b",
    tiles: ["#7a3b69", "#e0a32e", "#7a3b69", "#0e7c86"],
    label: { ru: "Слива", uz: "Olxoʻri" },
  },
  graphite: {
    id: "graphite",
    brand: "#2f3a44",
    header: "#14181c",
    accent: "#b2322b",
    tiles: ["#2f3a44", "#e0a32e", "#2f3a44", "#0e7c86"],
    label: { ru: "Графит", uz: "Grafit" },
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

export interface SiteCategory {
  id: string;
  title: Translated;
}

export interface SiteItem {
  /** `<slug>-s<n>`: globally unique, because booking rows reference it. */
  id: string;
  categoryId: string;
  title: Translated;
  description: Translated;
  durationMin: number;
  /** UZS, whole sums. */
  priceSum: number;
  popular: boolean;
  /** False for a showcase line (a menu position): shown with a price, not booked. */
  bookable: boolean;
}

export interface SiteStaff {
  /** `<slug>-m<n>`: globally unique, it is the `masters.id` bookings point at. */
  id: string;
  /** A person, a wash bay or a table: whatever is booked by the hour. */
  name: string;
  role: Translated;
  /** ISO weekdays, 1 = Monday. */
  workdays: number[];
  shiftStart: string;
  shiftEnd: string;
  itemIds: string[];
  tint: string;
}

export interface SiteSpec {
  version: 1;
  slug: string;
  kind: ProjectKind;
  name: string;
  /** Nine national digits, without +998. */
  phone: string;
  tagline: Translated;
  about: Translated;
  address: Translated;
  highlights: Translated[];
  hours: { from: string; to: string };
  theme: ThemeId;
  categories: SiteCategory[];
  items: SiteItem[];
  staff: SiteStaff[];
}

/** The facts a spec is anchored to. They come from the operator, never a model. */
export interface SpecBase {
  slug: string;
  name: string;
  phone: string;
  kind: ProjectKind;
}

export const LIMITS = {
  categories: 8,
  items: 40,
  staff: 12,
  highlights: 4,
  name: 80,
  tagline: 120,
  about: 600,
  address: 160,
  title: 80,
  description: 200,
  highlight: 60,
  role: 60,
  priceSum: 100_000_000,
} as const;

const KINDS: ProjectKind[] = ["salon", "cafe", "carwash", "custom"];
const TINTS = ["#0E7C86", "#B2322B", "#1F4B45", "#8A6A1F", "#7A3B69", "#2F3A44"];

/** What the bookable resource is called for each trade. */
export const STAFF_LABEL: Record<ProjectKind, Translated> = {
  salon: { ru: "Мастер", uz: "Usta" },
  cafe: { ru: "Столик", uz: "Stol" },
  carwash: { ru: "Бокс", uz: "Boks" },
  custom: { ru: "Специалист", uz: "Mutaxassis" },
};

/* ------------------------------------------------------------ primitives --- */

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  // Control characters out, runs of whitespace collapsed. Markup needs no
  // stripping: every string is rendered as a React text node, never as HTML.
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanTranslated(value: unknown, max: number): Translated {
  if (typeof value === "string") {
    const text = cleanText(value, max);
    return { ru: text, uz: text };
  }
  if (!value || typeof value !== "object") return { ru: "", uz: "" };
  const record = value as { ru?: unknown; uz?: unknown };
  const ru = cleanText(record.ru, max);
  // Uzbek Latin writes oʻ and gʻ with a turned comma. Models and keyboards
  // both produce a plain apostrophe there, so it is normalised on the way in.
  const uz = cleanText(record.uz, max).replace(/([oOgG])['’`ʼ‘]/g, "$1ʻ");
  // One language given: show it in both rather than leave half the site blank.
  return { ru: ru || uz, uz: uz || ru };
}

function cleanInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === "string" ? Number(value.replace(/[\s_]/g, "")) : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

/** "HH:MM" on the half-hour grid the slot picker uses. */
function cleanTime(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return fallback;
  const snapped = minutes < 15 ? 0 : minutes < 45 ? 30 : 0;
  const hour = minutes >= 45 ? Math.min(23, hours + 1) : hours;
  return `${String(hour).padStart(2, "0")}:${snapped === 0 ? "00" : "30"}`;
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function cleanPhone(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const digits = String(value).replace(/\D/g, "").replace(/^998(?=\d{9}$)/, "");
  return /^\d{9}$/.test(digits) ? digits : "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** The next free `<prefix><n>` given the ids already taken. */
export function nextId(prefix: string, taken: Iterable<string>): string {
  let max = 0;
  for (const id of taken) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}

/* -------------------------------------------------------------- sanitize --- */

/**
 * Turns anything — a model's answer, a browser's PUT body, a stored row — into
 * a valid spec for `base`.
 *
 * Nothing is trusted: every string is cleaned and capped, every number clamped,
 * every reference checked. Identity (slug) always comes from `base`; name and
 * phone fall back to it. Ids are forced into the tenant's own namespace so a
 * spec can never claim another tenant's master or service id.
 */
export function sanitizeSpec(raw: unknown, base: SpecBase): SiteSpec {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const slug = base.slug;

  const kind = KINDS.includes(input.kind as ProjectKind) ? (input.kind as ProjectKind) : base.kind;
  const label = STAFF_LABEL[kind];

  /* ---- categories ---- */
  const categories: SiteCategory[] = [];
  const categoryMap = new Map<string, string>();
  for (const entry of asArray(input.categories).slice(0, LIMITS.categories)) {
    const record = (entry ?? {}) as Record<string, unknown>;
    const title = cleanTranslated(record.title, LIMITS.title);
    if (!title.ru) continue;
    const given = typeof record.id === "string" ? record.id : "";
    const id =
      /^c\d+$/.test(given) && !categories.some((c) => c.id === given)
        ? given
        : nextId("c", categories.map((c) => c.id));
    if (given) categoryMap.set(given, id);
    categories.push({ id, title });
  }
  if (categories.length === 0) {
    categories.push({ id: "c1", title: { ru: "Услуги", uz: "Xizmatlar" } });
  }

  /* ---- items ---- */
  const itemPattern = new RegExp(`^${slug}-s\\d+$`);
  const items: SiteItem[] = [];
  const itemMap = new Map<string, string>();
  for (const entry of asArray(input.items).slice(0, LIMITS.items)) {
    const record = (entry ?? {}) as Record<string, unknown>;
    const title = cleanTranslated(record.title, LIMITS.title);
    if (!title.ru) continue;
    const given = typeof record.id === "string" ? record.id : "";
    const id =
      itemPattern.test(given) && !items.some((i) => i.id === given)
        ? given
        : nextId(`${slug}-s`, items.map((i) => i.id));
    if (given) itemMap.set(given, id);

    const givenCategory = typeof record.categoryId === "string" ? record.categoryId : "";
    const categoryId =
      categoryMap.get(givenCategory) ??
      (categories.some((c) => c.id === givenCategory) ? givenCategory : categories[0].id);

    const bookable = record.bookable !== false;
    items.push({
      id,
      categoryId,
      title,
      description: cleanTranslated(record.description, LIMITS.description),
      // Whole 5-minute steps; a showcase line has no duration to speak of.
      durationMin: bookable ? Math.round(cleanInt(record.durationMin, 10, 600, 60) / 5) * 5 : 0,
      priceSum: cleanInt(record.priceSum, 0, LIMITS.priceSum, 0),
      popular: record.popular === true,
      bookable,
    });
  }

  /* ---- hours ---- */
  const hoursInput = (input.hours ?? {}) as Record<string, unknown>;
  let from = cleanTime(hoursInput.from, "09:00");
  let to = cleanTime(hoursInput.to, "21:00");
  if (toMinutes(to) - toMinutes(from) < 60) {
    from = "09:00";
    to = "21:00";
  }

  /* ---- staff ---- */
  const bookableIds = items.filter((i) => i.bookable).map((i) => i.id);
  const staffPattern = new RegExp(`^${slug}-m\\d+$`);
  const staff: SiteStaff[] = [];
  for (const entry of asArray(input.staff).slice(0, LIMITS.staff)) {
    const record = (entry ?? {}) as Record<string, unknown>;
    const given = typeof record.id === "string" ? record.id : "";
    const id =
      staffPattern.test(given) && !staff.some((s) => s.id === given)
        ? given
        : nextId(`${slug}-m`, staff.map((s) => s.id));

    const workdays = Array.from(
      new Set(
        asArray(record.workdays)
          .map((day) => Number(day))
          .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7),
      ),
    ).sort((a, b) => a - b);

    let shiftStart = cleanTime(record.shiftStart, from);
    let shiftEnd = cleanTime(record.shiftEnd, to);
    if (toMinutes(shiftEnd) - toMinutes(shiftStart) < 60) {
      shiftStart = from;
      shiftEnd = to;
    }

    const served = Array.from(
      new Set(
        asArray(record.itemIds)
          .map((item) => (typeof item === "string" ? (itemMap.get(item) ?? item) : ""))
          .filter((item) => bookableIds.includes(item)),
      ),
    );

    const index = staff.length;
    staff.push({
      id,
      // No invented people: an unnamed resource is "Мастер 2", not a fake name.
      name: cleanText(record.name, 60) || `${label.ru} ${index + 1}`,
      role: cleanTranslated(record.role, LIMITS.role),
      workdays: workdays.length > 0 ? workdays : [1, 2, 3, 4, 5, 6],
      shiftStart,
      shiftEnd,
      // Nothing listed means "does everything", the common case for one chair.
      itemIds: served.length > 0 ? served : [...bookableIds],
      tint:
        typeof record.tint === "string" && /^#[0-9a-fA-F]{6}$/.test(record.tint)
          ? record.tint
          : TINTS[index % TINTS.length],
    });
  }

  // Something bookable needs someone to book: one default resource.
  if (staff.length === 0 && bookableIds.length > 0) {
    staff.push({
      id: `${slug}-m1`,
      name: `${label.ru} 1`,
      role: { ru: "", uz: "" },
      workdays: [1, 2, 3, 4, 5, 6],
      shiftStart: from,
      shiftEnd: to,
      itemIds: [...bookableIds],
      tint: TINTS[0],
    });
  }
  // An item nobody performs could be chosen and then never scheduled.
  for (const id of bookableIds) {
    if (!staff.some((member) => member.itemIds.includes(id))) {
      for (const member of staff) member.itemIds.push(id);
    }
  }

  const highlights = asArray(input.highlights)
    .map((entry) => cleanTranslated(entry, LIMITS.highlight))
    .filter((entry) => entry.ru)
    .slice(0, LIMITS.highlights);

  return {
    version: 1,
    slug,
    kind,
    name: cleanText(input.name, LIMITS.name) || base.name,
    phone: cleanPhone(input.phone) || cleanPhone(base.phone),
    tagline: cleanTranslated(input.tagline, LIMITS.tagline),
    about: cleanTranslated(input.about, LIMITS.about),
    address: cleanTranslated(input.address, LIMITS.address),
    highlights,
    hours: { from, to },
    theme: THEME_IDS.includes(input.theme as ThemeId) ? (input.theme as ThemeId) : "turquoise",
    // A category with nothing in it is a heading over nothing.
    categories: categories.filter(
      (category, index) => index === 0 || items.some((item) => item.categoryId === category.id),
    ),
    items,
    staff,
  };
}

export function baseOf(spec: SiteSpec): SpecBase {
  return { slug: spec.slug, name: spec.name, phone: spec.phone, kind: spec.kind };
}

/* ------------------------------------------------------------ operations --- */

/**
 * The closed set of edits the AI editor may make. A model never returns a new
 * site: it returns a short list of these, each applied to the current spec and
 * then re-sanitized, so an edit cannot silently drop the rest of the content.
 */
export type SiteOp = { op: string } & Record<string, unknown>;

const SETTABLE = [
  "name",
  "phone",
  "tagline",
  "about",
  "address",
  "highlights",
  "theme",
  "hoursFrom",
  "hoursTo",
] as const;

export function applyOps(spec: SiteSpec, ops: unknown): { spec: SiteSpec; applied: number } {
  const draft = JSON.parse(JSON.stringify(spec)) as SiteSpec & Record<string, unknown>;
  let applied = 0;

  for (const entry of asArray(ops).slice(0, 60)) {
    if (!entry || typeof entry !== "object") continue;
    const op = entry as SiteOp;

    switch (op.op) {
      case "set": {
        const field = op.field as (typeof SETTABLE)[number];
        if (!SETTABLE.includes(field)) break;
        if (field === "hoursFrom") draft.hours = { ...draft.hours, from: String(op.value) };
        else if (field === "hoursTo") draft.hours = { ...draft.hours, to: String(op.value) };
        else (draft as Record<string, unknown>)[field] = op.value;
        applied += 1;
        break;
      }
      case "upsert_category": {
        const existing = draft.categories.find((c) => c.id === op.id);
        if (existing) existing.title = { ...existing.title, ...(op.title as object) };
        else {
          draft.categories.push({
            id: nextId("c", draft.categories.map((c) => c.id)),
            title: op.title as Translated,
          });
        }
        applied += 1;
        break;
      }
      case "remove_category": {
        if (draft.categories.length <= 1) break;
        const before = draft.categories.length;
        draft.categories = draft.categories.filter((c) => c.id !== op.id);
        if (draft.categories.length === before) break;
        // Its items go with it: that is what removing a section means.
        draft.items = draft.items.filter((i) => i.categoryId !== op.id);
        applied += 1;
        break;
      }
      case "upsert_item": {
        const { op: _op, id, ...fields } = op;
        const existing = draft.items.find((i) => i.id === id);
        if (existing) {
          Object.assign(existing, mergeTranslated(existing, fields, ["title", "description"]));
        } else {
          draft.items.push({
            id: nextId(`${spec.slug}-s`, draft.items.map((i) => i.id)),
            categoryId: draft.categories[0]?.id ?? "c1",
            durationMin: 60,
            priceSum: 0,
            popular: false,
            bookable: true,
            description: { ru: "", uz: "" },
            ...fields,
          } as SiteItem);
        }
        applied += 1;
        break;
      }
      case "remove_item": {
        const before = draft.items.length;
        draft.items = draft.items.filter((i) => i.id !== op.id);
        if (draft.items.length !== before) applied += 1;
        break;
      }
      case "upsert_staff": {
        const { op: _op, id, ...fields } = op;
        const existing = draft.staff.find((s) => s.id === id);
        if (existing) Object.assign(existing, mergeTranslated(existing, fields, ["role"]));
        else {
          draft.staff.push({
            id: nextId(`${spec.slug}-m`, draft.staff.map((s) => s.id)),
            ...fields,
          } as SiteStaff);
        }
        applied += 1;
        break;
      }
      case "remove_staff": {
        const before = draft.staff.length;
        draft.staff = draft.staff.filter((s) => s.id !== op.id);
        if (draft.staff.length !== before) applied += 1;
        break;
      }
      case "scale_prices": {
        const percent = Number(op.percent);
        if (!Number.isFinite(percent) || percent <= -95 || percent > 500) break;
        for (const item of draft.items) {
          if (typeof op.categoryId === "string" && item.categoryId !== op.categoryId) continue;
          // Rounded to a thousand sums: nobody prices a haircut at 132 147.
          item.priceSum = Math.round((item.priceSum * (1 + percent / 100)) / 1000) * 1000;
        }
        applied += 1;
        break;
      }
      default:
        break;
    }
  }

  return { spec: sanitizeSpec(draft, baseOf(spec)), applied };
}

/** A partial `{ ru }` must not blank the `uz` that is already there. */
function mergeTranslated<T extends object>(
  current: T,
  fields: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...fields };
  for (const key of keys) {
    const next = fields[key];
    if (next && typeof next === "object") {
      merged[key] = { ...((current as Record<string, unknown>)[key] as object), ...next };
    }
  }
  return merged;
}

/* ------------------------------------------------------------- templates --- */

type Draft = Pick<
  SiteSpec,
  "tagline" | "about" | "highlights" | "hours" | "theme"
> & {
  categories: { id: string; title: Translated }[];
  items: Array<Partial<SiteItem> & { id: string; categoryId: string; title: Translated }>;
  staff: Array<Partial<SiteStaff>>;
};

const T = (ru: string, uz: string): Translated => ({ ru, uz });

const TEMPLATES: Record<ProjectKind, Draft> = {
  salon: {
    tagline: T("Салон красоты и барбершоп", "Goʻzallik saloni va barbershop"),
    about: T(
      "Стрижки, уход и маникюр по записи. Выберите услугу и удобное время — мы подтвердим запись.",
      "Soch turmagi, parvarish va manikyur — oldindan yozilish orqali. Xizmat va qulay vaqtni tanlang, biz tasdiqlaymiz.",
    ),
    highlights: [
      T("Запись онлайн за минуту", "Bir daqiqada onlayn yozilish"),
      T("Без очередей", "Navbatsiz"),
      T("Стерильные инструменты", "Steril asboblar"),
    ],
    hours: { from: "09:00", to: "21:00" },
    theme: "turquoise",
    categories: [
      { id: "c1", title: T("Волосы", "Soch") },
      { id: "c2", title: T("Борода", "Soqol") },
      { id: "c3", title: T("Ногти", "Tirnoqlar") },
    ],
    items: [
      { id: "s1", categoryId: "c1", title: T("Мужская стрижка", "Erkaklar soch turmagi"), durationMin: 45, priceSum: 80_000, popular: true },
      { id: "s2", categoryId: "c1", title: T("Женская стрижка", "Ayollar soch turmagi"), durationMin: 60, priceSum: 120_000, popular: true },
      { id: "s3", categoryId: "c1", title: T("Укладка", "Soch turmaklash"), durationMin: 45, priceSum: 100_000 },
      { id: "s4", categoryId: "c2", title: T("Коррекция бороды", "Soqolni shakllantirish"), durationMin: 30, priceSum: 50_000 },
      { id: "s5", categoryId: "c3", title: T("Маникюр с покрытием", "Lak bilan manikyur"), durationMin: 90, priceSum: 150_000 },
    ],
    staff: [
      { role: T("Барбер", "Barber"), itemIds: ["s1", "s4"] },
      { role: T("Стилист", "Stilist"), itemIds: ["s2", "s3", "s5"] },
    ],
  },
  cafe: {
    tagline: T("Кофейня и завтраки", "Qahvaxona va nonushta"),
    about: T(
      "Свежий кофе, выпечка и завтраки весь день. Забронируйте столик заранее — место будет ждать вас.",
      "Yangi qahva, pishiriqlar va kun boʻyi nonushta. Stolni oldindan band qiling — joy sizni kutadi.",
    ),
    highlights: [
      T("Бронь столика онлайн", "Stolni onlayn band qilish"),
      T("Завтраки весь день", "Kun boʻyi nonushta"),
      T("Кофе навынос", "Olib ketishga qahva"),
    ],
    hours: { from: "08:00", to: "22:00" },
    theme: "saffron",
    categories: [
      { id: "c1", title: T("Бронирование", "Band qilish") },
      { id: "c2", title: T("Кофе", "Qahva") },
      { id: "c3", title: T("Завтраки", "Nonushta") },
    ],
    items: [
      { id: "s1", categoryId: "c1", title: T("Столик на двоих", "Ikki kishilik stol"), durationMin: 90, priceSum: 0, popular: true },
      { id: "s2", categoryId: "c1", title: T("Столик на компанию", "Kompaniya uchun stol"), durationMin: 120, priceSum: 0 },
      { id: "s3", categoryId: "c2", title: T("Капучино", "Kapuchino"), priceSum: 28_000, bookable: false, popular: true },
      { id: "s4", categoryId: "c2", title: T("Американо", "Amerikano"), priceSum: 22_000, bookable: false },
      { id: "s5", categoryId: "c3", title: T("Сырники со сметаной", "Smetanali sirniki"), priceSum: 45_000, bookable: false },
      { id: "s6", categoryId: "c3", title: T("Омлет с овощами", "Sabzavotli omlet"), priceSum: 40_000, bookable: false },
    ],
    staff: [
      { name: "Столик у окна", role: T("До 2 гостей", "2 mehmongacha"), itemIds: ["s1"], workdays: [1, 2, 3, 4, 5, 6, 7] },
      { name: "Большой стол", role: T("До 6 гостей", "6 mehmongacha"), itemIds: ["s1", "s2"], workdays: [1, 2, 3, 4, 5, 6, 7] },
    ],
  },
  carwash: {
    tagline: T("Автомойка и детейлинг", "Avtomoyka va detalling"),
    about: T(
      "Моем быстро и аккуратно. Запишитесь на удобное время и приезжайте без ожидания в очереди.",
      "Tez va ehtiyotkorlik bilan yuvamiz. Qulay vaqtga yoziling va navbat kutmasdan keling.",
    ),
    highlights: [
      T("Запись на точное время", "Aniq vaqtga yozilish"),
      T("Без очереди", "Navbatsiz"),
      T("Зона ожидания", "Kutish zonasi"),
    ],
    hours: { from: "08:00", to: "22:00" },
    theme: "petrol",
    categories: [
      { id: "c1", title: T("Мойка", "Yuvish") },
      { id: "c2", title: T("Детейлинг", "Detalling") },
    ],
    items: [
      { id: "s1", categoryId: "c1", title: T("Экспресс-мойка кузова", "Kuzovni ekspress yuvish"), durationMin: 30, priceSum: 40_000, popular: true },
      { id: "s2", categoryId: "c1", title: T("Комплексная мойка", "Kompleks yuvish"), durationMin: 60, priceSum: 80_000, popular: true },
      { id: "s3", categoryId: "c2", title: T("Химчистка салона", "Salonni kimyoviy tozalash"), durationMin: 180, priceSum: 450_000 },
      { id: "s4", categoryId: "c2", title: T("Полировка кузова", "Kuzovni polirovka qilish"), durationMin: 240, priceSum: 600_000 },
    ],
    staff: [
      { role: T("Мойка", "Yuvish"), itemIds: ["s1", "s2"], workdays: [1, 2, 3, 4, 5, 6, 7] },
      { role: T("Детейлинг", "Detalling"), workdays: [1, 2, 3, 4, 5, 6, 7] },
    ],
  },
  custom: {
    tagline: T("Запись онлайн", "Onlayn yozilish"),
    about: T(
      "Выберите услугу и удобное время — мы свяжемся с вами и подтвердим запись.",
      "Xizmat va qulay vaqtni tanlang — siz bilan bogʻlanib, yozuvni tasdiqlaymiz.",
    ),
    highlights: [
      T("Запись онлайн", "Onlayn yozilish"),
      T("Подтверждение по телефону", "Telefon orqali tasdiqlash"),
    ],
    hours: { from: "09:00", to: "19:00" },
    theme: "graphite",
    categories: [{ id: "c1", title: T("Услуги", "Xizmatlar") }],
    items: [
      { id: "s1", categoryId: "c1", title: T("Консультация", "Maslahat"), durationMin: 30, priceSum: 0, popular: true },
      { id: "s2", categoryId: "c1", title: T("Основная услуга", "Asosiy xizmat"), durationMin: 60, priceSum: 100_000 },
    ],
    staff: [{}],
  },
};

/**
 * A complete, honest starting site for a trade, with no model involved. Used
 * when the AI is unavailable, so a business is never blocked on a provider.
 */
export function templateSpec(base: SpecBase): SiteSpec {
  return sanitizeSpec({ ...TEMPLATES[base.kind], kind: base.kind }, base);
}
