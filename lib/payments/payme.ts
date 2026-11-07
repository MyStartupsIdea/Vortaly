import type { PaymentIntent } from "@/lib/types";

/**
 * Payme (checkout.paycom.uz) — Merchant API stub.
 *
 * What is real here: the base64 parameter string Payme's hosted checkout
 * expects, so the redirect works once PAYME_MERCHANT_ID is set.
 *
 * What is still missing before taking money:
 *  1. A JSON-RPC endpoint at /api/payments/payme handling CheckPerformTransaction,
 *     CreateTransaction, PerformTransaction, CancelTransaction, CheckTransaction.
 *  2. Basic-auth verification of every call: the header is
 *     "Basic base64('Paycom:' + PAYME_SECRET_KEY)".
 *  3. Flipping the booking to "paid" only inside PerformTransaction.
 */

const CHECKOUT_BASE = "https://checkout.paycom.uz";

export function isPaymeConfigured(): boolean {
  return Boolean(process.env.PAYME_MERCHANT_ID);
}

export function buildPaymeIntent(
  bookingId: string,
  amountSum: number,
  locale: "ru" | "uz" = "ru",
): PaymentIntent {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const returnUrl = `${appUrl}/checkout/${bookingId}?paid=payme`;

  const fields = [
    `m=${process.env.PAYME_MERCHANT_ID ?? "MERCHANT_ID"}`,
    `ac.booking_id=${bookingId}`,
    // Payme counts in tiyin: 1 sum = 100 tiyin.
    `a=${amountSum * 100}`,
    `c=${returnUrl}`,
    `l=${locale}`,
  ].join(";");

  const encoded = Buffer.from(fields, "utf8").toString("base64");

  return {
    provider: "payme",
    bookingId,
    amountSum,
    returnUrl,
    checkoutUrl: `${CHECKOUT_BASE}/${encoded}`,
    status: "created",
  };
}
