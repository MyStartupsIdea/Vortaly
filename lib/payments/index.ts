import type { PaymentIntent, PaymentProvider } from "@/lib/types";
import { buildClickIntent, isClickConfigured } from "./click";
import { buildPaymeIntent, isPaymeConfigured } from "./payme";

export { isClickConfigured, isPaymeConfigured };

export function buildIntent(
  provider: PaymentProvider,
  bookingId: string,
  amountSum: number,
  locale: "ru" | "uz" = "ru",
): PaymentIntent {
  return provider === "click"
    ? buildClickIntent(bookingId, amountSum)
    : buildPaymeIntent(bookingId, amountSum, locale);
}

export function isProviderConfigured(provider: PaymentProvider): boolean {
  return provider === "click" ? isClickConfigured() : isPaymeConfigured();
}
