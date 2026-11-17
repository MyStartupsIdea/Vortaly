"use client";

import { useEffect, useRef } from "react";

/**
 * The official Telegram Login Widget. It draws its own button (an iframe) and
 * hands back a signed user object, which the server verifies with the bot
 * token (lib/telegram/login-widget.ts).
 *
 * It only renders on the domain set for the bot with @BotFather (/setdomain):
 * on localhost the iframe stays empty. Inside Telegram there is no need for it
 * at all, the Mini App's initData signs the owner in.
 */

export const TELEGRAM_BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") ?? "";

declare global {
  interface Window {
    __vortalyTelegramAuth?: (user: unknown) => void;
  }
}

export function TelegramLogin({ onAuth }: { onAuth: (user: unknown) => void }) {
  const host = useRef<HTMLDivElement>(null);
  // The widget calls a global by name; keep it pointing at the latest handler.
  const handler = useRef(onAuth);
  useEffect(() => {
    handler.current = onAuth;
  }, [onAuth]);

  useEffect(() => {
    const element = host.current;
    if (!TELEGRAM_BOT || !element) return;
    window.__vortalyTelegramAuth = (user) => handler.current(user);
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", TELEGRAM_BOT);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "12");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-onauth", "window.__vortalyTelegramAuth(user)");
    element.replaceChildren(script);
    return () => {
      element.replaceChildren();
    };
  }, []);

  return <div ref={host} className="flex min-h-[48px] justify-center" />;
}
