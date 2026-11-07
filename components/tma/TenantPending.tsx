"use client";

import Link from "next/link";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { subdomainOf, type Project } from "@/lib/data/projects";
import { useI18n } from "@/lib/i18n/provider";

/** Shown for a project whose agents have not finished building it yet. */
export function TenantPending({ project }: { project: Project }) {
  const { t } = useI18n();

  return (
    <main className="flex min-h-screen flex-col">
      <header className="bg-petrol px-5 pt-5 pb-6 text-porcelain">
        <div className="flex items-start justify-between gap-3">
          <p className="font-display text-[26px] leading-none font-bold tracking-[-0.03em]">
            {project.name}
          </p>
          <LanguageSwitcher />
        </div>
        <p className="mt-3 text-[13px] text-porcelain/60 tabular-nums">
          {subdomainOf(project)}
        </p>
      </header>

      <div aria-hidden className="flex h-2.5 w-full">
        {Array.from({ length: 14 }, (_, i) => (
          <span
            key={i}
            className={
              i % 4 === 1 ? "h-full flex-1 bg-saffron" : "biscuit h-full flex-1"
            }
          />
        ))}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <p className="font-display text-[19px] font-bold">
          {project.status === "failed" ? t("console.status.failed") : t("tenant.building")}
        </p>
        <p className="mt-2 max-w-[30ch] text-[14px] text-ink-muted">
          {t("tenant.buildingHint")}
        </p>
        {typeof project.progress === "number" && (
          <p className="mt-4 font-display text-[15px] font-bold tabular-nums text-brand">
            {t("console.progress", { percent: project.progress })}
          </p>
        )}
        <Link
          href="/"
          className="mt-8 rounded-full border border-hairline px-5 py-2.5 text-[14px] font-semibold"
        >
          {t("tenant.toConsole")}
        </Link>
      </div>
    </main>
  );
}
