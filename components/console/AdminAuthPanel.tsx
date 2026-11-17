"use client";

import { useI18n } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/Button";
import type { ReactNode } from "react";

/* Declared here: the module that used to export this type was removed, and
   this panel is its only remaining user. */
type AdminDataStatus = "loading" | "ready" | "admin-required" | "admin-locked" | "admin-unavailable";

interface Props {
  status: AdminDataStatus;
  warning: string | null;
  onContinueDemo: () => void;
  onRetry: () => void;
  children?: ReactNode;
}

export function AdminAuthPanel({ status, warning, onContinueDemo, onRetry, children }: Props) {
  const { t } = useI18n();

  if (status === "loading") return null;

  const isLockedOrRequired = status === "admin-required" || status === "admin-locked";
  const isUnavailable = status === "admin-unavailable";

  return (
    <div className="space-y-3">
      {/* Primary block: what is blocking real data. */}
      <div className="rounded-tile border border-saffron/40 bg-saffron/8 px-4 py-3 text-[13px] leading-relaxed">
        <p className="font-semibold text-ink">
          {isLockedOrRequired
            ? t("console.adminLocked")
            : isUnavailable
            ? t("console.adminUnavailable")
            : ""}
        </p>
        {warning && (
          <p className="mt-1 font-mono text-[11px] text-ink-muted">{warning}</p>
        )}
        {isLockedOrRequired && (
          <p className="mt-2 text-[12px] text-ink-muted">{t("console.adminLockedHint")}</p>
        )}
      </div>

      {/* Demo is never the silent default: give an explicit out. */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={onContinueDemo}>
          {t("console.continueDemo")}
        </Button>
        {isUnavailable && (
          <Button variant="ghost" size="sm" onClick={onRetry}>
            {t("action.retry")}
          </Button>
        )}
      </div>

      {/* Anything the caller/site wanted to show in the blocked state still renders
          beside the banner instead of being hidden behind a silent empty page. */}
      {children}
    </div>
  );
}
