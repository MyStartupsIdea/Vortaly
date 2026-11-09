import { NextResponse } from "next/server";
import { buildIntent, isProviderConfigured } from "@/lib/payments";
import type { PaymentProvider } from "@/lib/types";

function isProvider(value: string): value is PaymentProvider {
  return value === "click" || value === "payme";
}

/** Creates a checkout intent the browser can redirect to. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (!isProvider(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    bookingId?: string;
    amountSum?: number;
    locale?: "ru" | "uz";
  };

  if (!body.bookingId) {
    return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
  }
  if (!body.amountSum || body.amountSum <= 0) {
    return NextResponse.json({ error: "amountSum must be positive" }, { status: 400 });
  }

  // Tenant context for payments: this endpoint should only be usable from a
  // tenant subdomain where the middleware resolved x-salon-id server-side. The
  // header is overwritten by the middleware, so we ignore any client-supplied
  // value and reject requests without a resolved tenant.
  const salonIdHeader = request.headers.get("x-salon-id") as string | null;
  const salonId = salonIdHeader?.trim();
  if (!salonId) {
    return NextResponse.json(
      {
        error: "Tenant not resolved",
        hint: "Payment checkout must be started from your tenant subdomain.",
      },
      { status: 403 },
    );
  }

  const intent = buildIntent(provider, body.bookingId, body.amountSum, body.locale ?? "ru");

  return NextResponse.json({
    intent,
    configured: isProviderConfigured(provider),
    // Until the merchant callbacks below are implemented, nothing can be
    // marked as paid — the UI shows this as a stub.
    stub: true,
  });
}

/**
 * Merchant callback endpoint. Click posts form-encoded Prepare/Complete here;
 * Payme posts JSON-RPC. Both must verify their signature before touching a
 * booking — see lib/payments/click.ts and lib/payments/payme.ts.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  return NextResponse.json(
    {
      provider,
      implemented: false,
      message:
        "Merchant callbacks are not implemented yet. Implement signature checks before enabling live payments.",
    },
    { status: 501 },
  );
}
