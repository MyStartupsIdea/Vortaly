"use client";

import { useCallback, useEffect, useState } from "react";
import { AgentLog, type Run } from "@/components/console/AgentLog";
import { CommandCenter, type CreateRequest } from "@/components/console/CommandCenter";
import { ProjectPanel, type SessionCard } from "@/components/console/ProjectPanel";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { listSalons, provisionSalon, type SalonRecord } from "@/lib/api/salons";
import { ROOT_DOMAIN } from "@/lib/data/projects";
import { classifySave } from "@/lib/save-state";
import { useI18n } from "@/lib/i18n/provider";

/** Pace of the terminal. Events may arrive faster; rendering stays readable. */
const LINE_MS = 150;

export default function ConsolePage() {
  const { t } = useI18n();

  const [salons, setSalons] = useState<SalonRecord[] | null>(null);
  const [listWarning, setListWarning] = useState<string | null>(null);

  const [run, setRun] = useState<Run | null>(null);
  const [card, setCard] = useState<SessionCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setSalons(null);
    const result = await listSalons();
    setSalons(result.salons);
    setListWarning(result.warning ?? null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Reveals one received line per tick, and holds the run open while the
   * provisioning stream is still connected, so the terminal never claims to be
   * finished before the server has stopped working.
   */
  useEffect(() => {
    if (!run || run.finishedMs !== null) return;

    if (run.shown >= run.lines.length) {
      if (run.awaitingApi) return;
      setRun((r) => r && { ...r, finishedMs: Date.now() - r.startedAt });
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRun((r) => r && { ...r, shown: r.lines.length });
      return;
    }

    const id = window.setTimeout(
      () => setRun((r) => r && { ...r, shown: r.shown + 1 }),
      LINE_MS,
    );
    return () => window.clearTimeout(id);
  }, [run]);

  const handleCreate = useCallback(
    async (request: CreateRequest) => {
      setBusy(true);
      setError(null);
      setCard(null);
      setRun({
        slug: "",
        lines: [],
        shown: 0,
        startedAt: Date.now(),
        finishedMs: null,
        awaitingApi: true,
      });

      let failed: string | null = null;
      // The request shown in the review step is the source of truth. AI
      // suggestions must never replace values the operator has confirmed.
      const effectiveRequest = request;

      await provisionSalon(
        {
          name: effectiveRequest.name,
          phoneNational: effectiveRequest.phoneNational,
          kind: effectiveRequest.kind,
          brief: effectiveRequest.brief,
          taglineRu: effectiveRequest.taglineRu,
          taglineUz: effectiveRequest.taglineUz,
        },
        (event) => {
          if (event.type === "step") {
            setRun(
              (r) =>
                r && {
                  ...r,
                  lines: [
                    ...r.lines,
                    { stage: event.stage, level: event.level, text: event.text },
                  ],
                },
            );
            return;
          }

          if (event.type === "done") {
            setRun((r) => r && { ...r, slug: event.slug });
            setCard({
              slug: event.slug,
              name: effectiveRequest.name,
              subdomain: event.subdomain,
              persisted: event.persisted,
              warning: event.warning,
            });
            // A persisted tenant is a real row, so the list can show it.
            if (event.persisted) void refresh();
            return;
          }

          failed = event.error;
          setRun(
            (r) =>
              r && {
                ...r,
                lines: [
                  ...r.lines,
                  {
                    stage: "deploy" as const,
                    level: "warn" as const,
                    text: `error ${event.status}: ${event.error}`,
                  },
                ],
              },
          );
        },
      );

      setRun((r) => r && { ...r, awaitingApi: false });
      setBusy(false);
      if (failed) setError(failed);
    },
    [refresh],
  );

  const reset = useCallback(() => {
    setCard(null);
    setError(null);
    setRun(null);
  }, []);

  /* What the run actually achieved, as distinct from whether it finished.
     Null while nothing has been created in this session yet. */
  const outcome = card ? classifySave(card) : null;
  const seconds = run?.finishedMs !== null && run ? (run.finishedMs / 1000).toFixed(1) : "0";

  return (
    <div className="flex min-h-screen flex-col bg-surface-sunken lg:h-dvh lg:overflow-hidden">
      <header className="flex flex-none items-center justify-between gap-4 border-b border-hairline bg-surface px-4 py-3 lg:px-6">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-[19px] leading-none font-bold tracking-[-0.03em]">
            UzMini
          </span>
          <span className="font-mono text-[11px] text-ink-muted">{ROOT_DOMAIN}</span>
        </div>
        <LanguageSwitcher />
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[clamp(220px,19vw,280px)_minmax(0,1fr)_clamp(320px,27vw,400px)]">
        <div className="order-2 min-h-0 border-t border-hairline bg-surface lg:order-1 lg:border-t-0">
          <ProjectPanel
            salons={salons}
            warning={listWarning}
            card={card}
            onRefresh={() => void refresh()}
          />
        </div>

        <div className="order-1 min-h-0 bg-surface lg:order-2">
          <CommandCenter
            onCreate={(request) => void handleCreate(request)}
            busy={busy}
            created={card}
            error={error}
            onReset={reset}
          />
        </div>

        <div className="order-3 min-h-[360px] lg:min-h-0">
          <AgentLog run={run} saveState={outcome} />
        </div>
      </div>

      {/* Outcome announcement; the log itself is a polite live region.
          A finished stream alone is never announced as a success — screen
          reader users get the same distinction the sighted UI makes. */}
      <p className="sr-only" role="status">
        {run && run.finishedMs !== null
          ? outcome === "saved"
            ? t("console.outcomeSaved", { seconds })
            : outcome
              ? t("console.outcomeUnsaved", { seconds })
              : t("console.streamDone", { seconds })
          : ""}
      </p>
    </div>
  );
}
