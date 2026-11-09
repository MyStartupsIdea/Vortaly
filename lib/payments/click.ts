import type { PaymentIntent } from "@/lib/types";

/**
 * Click (my.click.uz) — SHOP API stub.
 *
 * What is real here: the hosted checkout URL shape, so the redirect works the
 * moment CLICK_SERVICE_ID and CLICK_MERCHANT_ID are filled in.
 *
 * What is still missing before taking money:
 *  1. Prepare/Complete endpoints at /api/payments/click (Click calls them
 *     server-to-server, twice per payment).
 *  2. The md5 signature check on those callbacks:
 *     md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id
 *         + amount + action + sign_time)
 *  3. Flipping the booking to "paid" only from the Complete callback — never
 *     from the browser's return_url, which a customer can forge.
 */

const CHECKOUT_BASE = "https://my.click.uz/services/pay";

export function isClickConfigured(): boolean {
  return Boolean(process.env.CLICK_SERVICE_ID && process.env.CLICK_MERCHANT_ID);
}

export function buildClickIntent(
  bookingId: string,
  amountSum: number,
  locale?: "ru" | "uz",
): PaymentIntent {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const returnLocale = locale === "uz" ? "uz" : "ru";
  const returnUrl = `${appUrl}/checkout/${bookingId}?paid=click&locale=${returnLocale}`;

  const params = new URLSearchParams({
    service_id: process.env.CLICK_SERVICE_ID ?? "SERVICE_ID",
    merchant_id: process.env.CLICK_MERCHANT_ID ?? "MERCHANT_ID",
    // Click expects the amount in sums.
    amount: String(amountSum),
    transaction_param: bookingId,
    return_url: returnUrl,
  });

  return {
    provider: "click",
    bookingId,
    amountSum,
    returnUrl,
    checkoutUrl: `${CHECKOUT_BASE}?${params.toString()}`,
    status: "created",
  };
}

/** Placeholder for the signature the Prepare/Complete callbacks must verify. */
export function clickSignatureSource(input: {
  clickTransId: string;
  serviceId: string;
  merchantTransId: string;
  amount: string;
  action: string;
  signTime: string;
}): string {
  const secret = process.env.CLICK_SECRET_KEY ?? "";
  return [
    input.clickTransId,
    input.serviceId,
    secret,
    input.merchantTransId,
    input.amount,
    input.action,
    input.signTime,
  ].join("");
}
