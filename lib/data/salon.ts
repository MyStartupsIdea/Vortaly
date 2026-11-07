import type { Master, Salon, Service } from "@/lib/types";

/**
 * Demo content for the MVP. Swap for Supabase queries in lib/supabase/queries.ts
 * once the tables in supabase/schema.sql are live — the shapes match.
 */

export const salon: Salon = {
  id: "chinor-tashkent",
  name: "Chinor",
  tagline: {
    ru: "Салон и барбершоп на Буюк Ипак Йули",
    uz: "Buyuk Ipak Yoʻlidagi salon va barbershop",
  },
  address: {
    ru: "Ташкент, Мирзо-Улугбек, ул. Буюк Ипак Йули, 12",
    uz: "Toshkent, Mirzo Ulugʻbek, Buyuk Ipak Yoʻli koʻchasi, 12",
  },
  phone: "998712001212",
  rating: 4.8,
  reviewCount: 326,
  openFrom: "09:00",
  openTo: "21:00",
};

export const services: Service[] = [
  {
    id: "haircut-women",
    group: "hair",
    title: { ru: "Женская стрижка", uz: "Ayollar sochini kesish" },
    durationMin: 60,
    priceSum: 120_000,
    popular: true,
  },
  {
    id: "haircut-men",
    group: "hair",
    title: { ru: "Мужская стрижка", uz: "Erkaklar sochini kesish" },
    durationMin: 45,
    priceSum: 80_000,
    popular: true,
  },
  {
    id: "haircut-kids",
    group: "hair",
    title: { ru: "Детская стрижка", uz: "Bolalar sochini kesish" },
    durationMin: 30,
    priceSum: 60_000,
  },
  {
    id: "styling",
    group: "hair",
    title: { ru: "Укладка", uz: "Soch turmagi" },
    durationMin: 45,
    priceSum: 100_000,
  },
  {
    id: "beard-trim",
    group: "beard",
    title: { ru: "Коррекция бороды", uz: "Soqol olish va shakllantirish" },
    durationMin: 30,
    priceSum: 50_000,
    popular: true,
  },
  {
    id: "shave-razor",
    group: "beard",
    title: { ru: "Бритьё опасной бритвой", uz: "Ustara bilan soqol olish" },
    durationMin: 30,
    priceSum: 70_000,
  },
  {
    id: "color-single",
    group: "color",
    title: { ru: "Окрашивание в один тон", uz: "Bir tonda boʻyash" },
    durationMin: 120,
    priceSum: 350_000,
  },
  {
    id: "color-highlights",
    group: "color",
    title: { ru: "Мелирование", uz: "Melirlash" },
    durationMin: 150,
    priceSum: 480_000,
  },
  {
    id: "manicure",
    group: "nails",
    title: { ru: "Маникюр с покрытием", uz: "Lak bilan manikyur" },
    durationMin: 90,
    priceSum: 150_000,
    popular: true,
  },
  {
    id: "pedicure",
    group: "nails",
    title: { ru: "Педикюр", uz: "Pedikyur" },
    durationMin: 90,
    priceSum: 180_000,
  },
  {
    id: "brows",
    group: "brows",
    title: { ru: "Коррекция и окрашивание бровей", uz: "Qosh korreksiyasi va boʻyash" },
    durationMin: 40,
    priceSum: 90_000,
  },
  {
    id: "lashes",
    group: "brows",
    title: { ru: "Ламинирование ресниц", uz: "Kipriklarni laminatsiya qilish" },
    durationMin: 75,
    priceSum: 220_000,
  },
];

export const masters: Master[] = [
  {
    id: "aziza",
    name: "Азиза",
    craft: { ru: "Стилист-колорист", uz: "Stilist-kolorist" },
    rating: 4.9,
    reviewCount: 148,
    serviceIds: [
      "haircut-women",
      "haircut-kids",
      "styling",
      "color-single",
      "color-highlights",
    ],
    workdays: [1, 2, 3, 4, 5],
    shiftStart: "10:00",
    shiftEnd: "19:00",
    busy: {},
    tint: "#0E7C86",
  },
  {
    id: "dilnoza",
    name: "Дилноза",
    craft: { ru: "Мастер ногтевого сервиса", uz: "Manikyur ustasi" },
    rating: 4.8,
    reviewCount: 96,
    serviceIds: ["manicure", "pedicure", "brows", "lashes"],
    workdays: [1, 3, 5, 6],
    shiftStart: "09:00",
    shiftEnd: "18:00",
    busy: {},
    tint: "#B2322B",
  },
  {
    id: "rustam",
    name: "Рустам",
    craft: { ru: "Барбер", uz: "Barber" },
    rating: 5.0,
    reviewCount: 211,
    serviceIds: ["haircut-men", "haircut-kids", "beard-trim", "shave-razor"],
    workdays: [1, 2, 3, 4, 5, 6],
    shiftStart: "10:00",
    shiftEnd: "21:00",
    busy: {},
    tint: "#1F4B45",
  },
  {
    id: "jasur",
    name: "Жасур",
    craft: { ru: "Барбер, стрижка машинкой", uz: "Barber, mashinka bilan kesish" },
    rating: 4.7,
    reviewCount: 74,
    serviceIds: ["haircut-men", "haircut-kids", "beard-trim"],
    workdays: [2, 4, 6, 7],
    shiftStart: "11:00",
    shiftEnd: "20:00",
    busy: {},
    tint: "#8A6A1F",
  },
];

export function getService(id: string): Service | undefined {
  return services.find((s) => s.id === id);
}

export function getMaster(id: string): Master | undefined {
  return masters.find((m) => m.id === id);
}

export function mastersForServices(serviceIds: string[]): Master[] {
  if (serviceIds.length === 0) return masters;
  return masters.filter((m) => serviceIds.every((id) => m.serviceIds.includes(id)));
}

export function totalFor(serviceIds: string[]): { sum: number; minutes: number } {
  return serviceIds.reduce(
    (acc, id) => {
      const service = getService(id);
      if (!service) return acc;
      return { sum: acc.sum + service.priceSum, minutes: acc.minutes + service.durationMin };
    },
    { sum: 0, minutes: 0 },
  );
}
