"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ActionBar } from "@/components/ui/ActionBar";
import { Button } from "@/components/ui/Button";
import { getBookings } from "@/lib/data/bookings";
import { formatDayMonth, formatSum, fromIsoDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { useTelegram } from "@/lib/telegram-provider";
import type { Booking, PaymentIntent, PaymentProvider } from "@/lib/types";
import { cx } from "@/lib/cx";

const PROVIDERS: { value: PaymentProvider; labelKey: "pay.click" | "pay.payme" }[] = [
  { value: "click", labelKey: "pay.click" },
  { value: "payme", labelKey: "pay.payme" },
];

function CheckoutContent({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { t, locale } = useI18n();
  const { webApp, haptic } = useTelegram();

  const preferred = params.get("provider");
  const [provider, setProvider] = useState<PaymentProvider>(
    preferred === "payme" ? "payme" : "click",
  );
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  // Resolved after mount: the store answers with a seed on the server.
  const [booking, setBooking] = useState<Booking | null | undefined>(undefined);
  useEffect(() => {
    setBooking(getBookings().find((b) => b.id === bookingId) ?? null);
  }, [bookingId]);

  const hydrated = booking !== undefined;

  async function pay() {
    if (!booking) return;
    setBusy(true);
    haptic("press");

    const response = await fetch(`/api/payments/${provider}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingId: booking.id,
        amountSum: booking.totalSum,
        locale,
      }),
    });

    const data = (await response.json()) as { intent: PaymentIntent; configured: boolean };
    setIntent(data.intent);
    setConfigured(data.configured);
    setBusy(false);

    // With real merchant credentials in place this is the live redirect; the
    // provider is opened outside the Mini App webview so 3-D Secure works.
    if (data.configured) {
      if (webApp) webApp.openLink(data.intent.checkoutUrl);
      else window.location.href = data.intent.checkoutUrl;
    }
  }

  if (hydrated && !booking) {
    return (
      <main className="min-h-screen px-5 pt-20 text-center">
        <p className="font-display text-[18px] font-bold">{t("booking.empty")}</p>
        <Button className="mt-6" onClick={() => router.push("/")}>
          {t("booking.emptyCta")}
        </Button>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col">
      <div className="border-b border-hairline px-5 pt-5 pb-4">
        <button
          type="button"
          onClick={() => router.push("/bookings")}
          className="text-[13px] font-semibold text-brand"
        >
          {t("pay.back")}
        </button>
        <h1 className="font-display text-[22px] leading-tight font-bold tracking-[-0.02em]">
          {t("pay.title")}
        </h1>
        <p className="mt-1 text-[13px] text-ink-muted">{t("pay.hint")}</p>
      </div>

      {booking && (
        <div className="mx-5 mt-5 rounded-card border border-hairline bg-surface-raised p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[14px] text-ink-muted">{t("confirm.when")}</span>
            <span className="font-semibold">
              {formatDayMonth(fromIsoDate(booking.date), locale)}, {booking.time}
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-hairline pt-3">
            <span className="text-[14px] font-semibold">{t("confirm.total")}</span>
            <span className="font-display text-[22px] font-bold tabular-nums">
              {formatSum(booking.totalSum, locale)}
            </span>
          </div>
        </div>
      )}

      <div className="mt-6 px-5">
        <div className="grid grid-cols-2 gap-2">
          {PROVIDERS.map((option) => {
            const active = provider === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setProvider(option.value);
                  setIntent(null);
                  haptic("select");
                }}
                className={cx(
                  "rounded-card px-4 py-4 font-display text-[16px] font-bold transition-colors duration-150",
                  active ? "glaze-brand text-brand-ink" : "glaze border border-hairline",
                )}
              >
                {t(option.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      {intent && configured === false && (
        <div className="mx-5 mt-5 rounded-card border border-saffron/50 bg-saffron/10 p-4">
          <p className="text-[13px]">
            {t("pay.stub", { provider: provider === "click" ? "Click" : "Payme" })}
          </p>
          <pre className="mt-3 overflow-x-auto rounded-tile bg-petrol p-3 text-[11px] leading-relaxed text-porcelain">
            {`POST /api/payments/${provider}
bookingId: ${intent.bookingId}
amount:    ${intent.amountSum} ${provider === "payme" ? "sum (sent as tiyin)" : "sum"}
redirect:  ${intent.checkoutUrl}`}
          </pre>
        </div>
      )}

      <div className="flex-1" />

      <ActionBar>
        <Button block disabled={busy || !booking} onClick={pay}>
          {t("pay.submit")}
        </Button>
      </ActionBar>
    </main>
  );
}

export default function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <CheckoutContent bookingId={id} />
    </Suspense>
  );
}
