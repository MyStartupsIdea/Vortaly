"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { TelegramUser, TelegramWebApp } from "@/lib/telegram.d";

interface TelegramValue {
  webApp: TelegramWebApp | null;
  user: TelegramUser | null;
  /** False when the app runs in a plain browser tab — useful during development. */
  inTelegram: boolean;
  haptic: (kind: "select" | "press" | "success" | "error") => void;
}

const TelegramContext = createContext<TelegramValue>({
  webApp: null,
  user: null,
  inTelegram: false,
  haptic: () => {},
});

export function TelegramProvider({ children }: { children: ReactNode }) {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);

  useEffect(() => {
    const app = window.Telegram?.WebApp;
    if (!app) return;
    app.ready();
    app.expand();
    setWebApp(app);
  }, []);

  const value = useMemo<TelegramValue>(
    () => ({
      webApp,
      user: webApp?.initDataUnsafe.user ?? null,
      inTelegram: webApp !== null,
      haptic: (kind) => {
        const h = webApp?.HapticFeedback;
        if (!h) return;
        if (kind === "select") h.selectionChanged();
        else if (kind === "press") h.impactOccurred("light");
        else if (kind === "success") h.notificationOccurred("success");
        else h.notificationOccurred("error");
      },
    }),
    [webApp],
  );

  return <TelegramContext.Provider value={value}>{children}</TelegramContext.Provider>;
}

export function useTelegram(): TelegramValue {
  return useContext(TelegramContext);
}
