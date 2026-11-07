"use client";

import { useEffect, useRef } from "react";
import { STAGE_ORDER, type LogLine, type StageId } from "@/lib/data/projects";
import { useI18n } from "@/lib/i18n/provider";
import { cx } from "@/lib/cx";

const STAGE_LABEL = {
  schema: "console.stage.schema",
  domain: "console.stage.domain",
  ui: "console.stage.ui",
  deploy: "console.stage.deploy",
} as const;

const LEVEL_TINT = {
  info: "text-porcelain/55",
  ok: "text-turquoise",
  warn: "text-saffron",
} as const;

export interface Run {
  slug: string;
  lines: LogLine[];
  /** How many lines have streamed in so far. */
  shown: number;
  startedAt: number;
  /** Set once the last line has landed and the API has answered. */
  finishedMs: number | null;
  /** True until POST /api/admin/salons resolves and its lines are appended. */
  awaitingApi: boolean;
}

/** Wall-clock stamps make a log scannable; derived from the run, not Date.now(). */
function stamp(startedAt: number, index: number): string {
  const d = new Date(startedAt + index * 420);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

export function AgentLog({ run }: { run: Run | null }) {
  const { t } = useI18n();
  const scroller = useRef<HTMLDivElement>(null);

  // Follow the tail the way a terminal does.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [run?.shown]);

  const visible = run ? run.lines.slice(0, run.shown) : [];

  const stageState = (stage: StageId): "done" | "running" | "pending" => {
    if (!run) return "pending";
    const last = visible.at(-1);
    if (!last) return "pending";
    const order = STAGE_ORDER.indexOf(stage);
    const current = STAGE_ORDER.indexOf(last.stage);
    if (run.finishedMs !== null) return "done";
    if (order < current) return "done";
    if (order === current) return "running";
    return "pending";
  };

  return (
    <aside className="flex h-full min-h-0 flex-col border-hairline bg-petrol text-porcelain lg:border-l">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-5 pb-3">
        <h2 className="font-display text-[15px] font-bold tracking-[-0.01em]">
          {t("console.log")}
        </h2>
        {run && (
          <span className="font-mono text-[11px] text-porcelain/50 tabular-nums">
            {run.finishedMs !== null
              ? t("console.done", { seconds: (run.finishedMs / 1000).toFixed(1) })
              : `${run.shown}/${run.lines.length}${run.awaitingApi ? "+" : ""}`}
          </span>
        )}
      </div>

      {/* The four stages are a real sequence, so they are numbered. */}
      <ol className="border-y border-porcelain/10 px-4 py-3">
        {STAGE_ORDER.map((stage, i) => {
          const state = stageState(stage);
          return (
            <li key={stage} className="flex items-center gap-2.5 py-1">
              <span
                aria-hidden
                className={cx(
                  "grid size-5 flex-none place-items-center rounded-tile font-mono text-[10px] font-bold tabular-nums",
                  state === "done"
                    ? "bg-turquoise text-petrol"
                    : state === "running"
                      ? "bg-saffron text-petrol motion-safe:animate-pulse"
                      : "bg-porcelain/10 text-porcelain/45",
                )}
              >
                {i + 1}
              </span>
              <span
                className={cx(
                  "text-[12px]",
                  state === "pending" ? "text-porcelain/40" : "text-porcelain/85",
                )}
              >
                {t(STAGE_LABEL[stage])}
              </span>
            </li>
          );
        })}
      </ol>

      <div
        ref={scroller}
        role="log"
        aria-live="polite"
        aria-label={t("console.log")}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
      >
        {!run ? (
          <div className="pt-10 text-center">
            <p className="font-display text-[14px] font-bold text-porcelain/70">
              {t("console.logIdle")}
            </p>
            <p className="mx-auto mt-1.5 max-w-[26ch] text-[12px] text-porcelain/45">
              {t("console.logIdleHint")}
            </p>
          </div>
        ) : (
          <ul className="space-y-1 font-mono text-[11px] leading-relaxed">
            {visible.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="flex-none text-porcelain/30 tabular-nums">
                  {stamp(run.startedAt, i)}
                </span>
                <span className={cx("min-w-0 break-words", LEVEL_TINT[line.level])}>
                  {line.text}
                </span>
              </li>
            ))}
            {run.finishedMs === null && (
              <li aria-hidden className="flex gap-2">
                <span className="flex-none text-porcelain/30">{"       "}</span>
                <span className="inline-block h-3.5 w-1.5 bg-turquoise motion-safe:animate-pulse" />
              </li>
            )}
          </ul>
        )}
      </div>
    </aside>
  );
}
