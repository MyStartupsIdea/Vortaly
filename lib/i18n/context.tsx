"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { Locale } from "@/lib/types";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  isHydrated: boolean;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: "ru",
  setLocale: () => {},
  isHydrated: false,
});

export const STORAGE_KEY = "vortaly:locale";

function readStored(): Locale {
  if (typeof window === "undefined") return "ru";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "ru" || raw === "uz") return raw;
  } catch {
    // ignore
  }
  return "ru";
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ru");
  const [isHydrated, setIsHydrated] = useState(false);

  // Keep the two state variables in sync after hydration so SSR and client
  // agree on the initial locale without a flash.
  useEffect(() => {
    const stored = readStored();
    setLocaleState(stored);
    setIsHydrated(true);
  }, []);

  const setLocale = useCallback(
    (l: Locale) => {
      if (typeof window === "undefined") return;
      try {
        localStorage.setItem(STORAGE_KEY, l);
      } catch {
        // ignore
      }
      setLocaleState(l);
      // Keep the document lang in sync so screen readers / browser tooling
      // see the currently selected interface language.
      document.documentElement.lang = l === "uz" ? "uz" : "ru";
    },
    [],
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale, isHydrated }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used inside a LocaleProvider");
  }
  return ctx;
}
