export type Locale = "ru" | "uz";

export type Translated = Record<Locale, string>;

export type ServiceGroup = "hair" | "beard" | "color" | "nails" | "brows";

export interface Service {
  id: string;
  group: ServiceGroup;
  title: Translated;
  /** Minutes the chair is occupied, used to lay out the slot grid. */
  durationMin: number;
  /** Price in UZS. Integer sums only — there are no tiyin in practice. */
  priceSum: number;
  popular?: boolean;
}

export interface Master {
  id: string;
  name: string;
  craft: Translated;
  rating: number;
  reviewCount: number;
  /** Services this master performs. */
  serviceIds: string[];
  /** 1 = Monday … 7 = Sunday, matching ISO weekday numbering. */
  workdays: number[];
  shiftStart: string;
  shiftEnd: string;
  /** Slots already taken, keyed by ISO date: { "2026-11-07": ["10:00"] }. */
  busy: Record<string, string[]>;
  tint: string;
}

export interface Salon {
  id: string;
  name: string;
  tagline: Translated;
  address: Translated;
  phone: string;
  rating: number;
  reviewCount: number;
  openFrom: string;
  openTo: string;
}

export type BookingStatus = "draft" | "pending" | "confirmed" | "paid" | "cancelled";

export interface Booking {
  id: string;
  salonId: string;
  masterId: string;
  serviceIds: string[];
  /** ISO date, YYYY-MM-DD. */
  date: string;
  /** Local time, HH:mm. */
  time: string;
  durationMin: number;
  totalSum: number;
  status: BookingStatus;
  customerName: string;
  customerPhone: string;
  telegramUserId?: number;
  /** How the customer paid, once a provider has confirmed it. */
  paymentProvider?: PaymentProvider;
  createdAt: string;
}

export type PaymentProvider = "click" | "payme";

export interface PaymentIntent {
  provider: PaymentProvider;
  bookingId: string;
  amountSum: number;
  /** Where the provider sends the customer back. */
  returnUrl: string;
  /** Hosted checkout URL the customer is redirected to. */
  checkoutUrl: string;
  status: "created" | "pending" | "paid" | "failed";
}
