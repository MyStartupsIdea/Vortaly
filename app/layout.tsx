import type { Metadata, Viewport } from "next";
import { Manrope, Onest } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { LocaleProvider } from "@/lib/i18n/context";
import { I18nProvider } from "@/lib/i18n/provider";
import { TelegramProvider } from "@/lib/telegram-provider";
import { BookingProvider } from "@/lib/booking/store";

/** Onest for headings, Manrope for UI and text (see DESIGN.md). Both carry Cyrillic. */
const onest = Onest({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-onest",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Chinor — запись онлайн | Vortaly",
  description:
    "Запись в салон и барбершоп Chinor в Ташкенте: услуги, мастера, свободное время. Модуль платформы Vortaly.",
  applicationName: "Vortaly",
  other: { "format-detection": "telephone=no" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Stops iOS from zooming the page when a text field takes focus.
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f9ff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1526" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${onest.variable} ${manrope.variable}`}>
      <head>
        {/* Must run before hydration so window.Telegram exists on first render. */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body className="bg-surface text-ink antialiased">
        <TelegramProvider>
          {/* LocaleProvider owns the active language; I18nProvider turns that
              choice into strings. Order matters: the translator reads the locale. */}
          <LocaleProvider>
            <I18nProvider>
              {/* The phone frame lives in app/(tma)/layout.tsx: the platform
                  console at / is a desktop surface and needs the full width. */}
              <BookingProvider>{children}</BookingProvider>
            </I18nProvider>
          </LocaleProvider>
        </TelegramProvider>
      </body>
    </html>
  );
}
