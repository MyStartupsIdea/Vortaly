"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { totalFor } from "@/lib/data/salon";

export type PayMethod = "cash" | "click" | "payme";

export interface Draft {
  serviceIds: string[];
  /** A master id, or "any" for the first free master. */
  masterId: string | null;
  date: string | null;
  time: string | null;
  name: string;
  phone: string;
  payMethod: PayMethod;
}

const EMPTY_DRAFT: Draft = {
  serviceIds: [],
  masterId: null,
  date: null,
  time: null,
  name: "",
  phone: "",
  payMethod: "cash",
};

const DRAFT_KEY = "vortaly.draft";

/**
 * The in-progress booking only. Confirmed bookings live in
 * lib/data/bookings.ts, which is also what the slot grid reads, so the list and
 * the occupancy can never disagree.
 */
interface StoreValue {
  draft: Draft;
  toggleService: (id: string) => void;
  setMaster: (id: string | null) => void;
  setDay: (isoDate: string | null) => void;
  setTime: (time: string | null) => void;
  setField: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  resetDraft: () => void;
  total: { sum: number; minutes: number };
  /** False until the first client render has restored the persisted draft. */
  hydrated: boolean;
}

const StoreContext = createContext<StoreValue | null>(null);

export function BookingProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) setDraft(JSON.parse(raw) as Draft);
    } catch {
      // A corrupt draft is not worth failing over — start fresh.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft, hydrated]);

  const toggleService = useCallback((id: string) => {
    setDraft((prev) => {
      const has = prev.serviceIds.includes(id);
      const serviceIds = has
        ? prev.serviceIds.filter((s) => s !== id)
        : [...prev.serviceIds, id];
      // The chosen master may not perform the new set, and the slot length
      // changes with it, so both selections are cleared.
      return { ...prev, serviceIds, masterId: null, time: null };
    });
  }, []);

  const setMaster = useCallback((id: string | null) => {
    setDraft((prev) => ({ ...prev, masterId: id, time: null }));
  }, []);

  const setDay = useCallback((isoDate: string | null) => {
    setDraft((prev) => ({ ...prev, date: isoDate, time: null }));
  }, []);

  const setTime = useCallback((time: string | null) => {
    setDraft((prev) => ({ ...prev, time }));
  }, []);

  const setField = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetDraft = useCallback(() => setDraft(EMPTY_DRAFT), []);

  const value = useMemo<StoreValue>(
    () => ({
      draft,
      toggleService,
      setMaster,
      setDay,
      setTime,
      setField,
      resetDraft,
      total: totalFor(draft.serviceIds),
      hydrated,
    }),
    [draft, toggleService, setMaster, setDay, setTime, setField, resetDraft, hydrated],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useBooking(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useBooking must be used inside <BookingProvider>");
  return ctx;
}
