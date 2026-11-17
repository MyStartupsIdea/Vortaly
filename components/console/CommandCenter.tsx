"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { SessionCard } from "@/components/console/ProjectPanel";
import { SaveNotice } from "@/components/ui/SaveBadge";
import { readBrief } from "@/lib/console/brief";
import { classifySave, isSaved } from "@/lib/save-state";
import { ROOT_DOMAIN, TEMPLATES, type ProjectKind } from "@/lib/data/projects";
import { useI18n } from "@/lib/i18n/provider";
import { slugify } from "@/lib/translit";
import { cx } from "@/lib/cx";

const TPL_LABEL = { salon: "tpl.salon", cafe: "tpl.cafe", carwash: "tpl.carwash" } as const;
const TPL_HINT = {
  salon: "tpl.salonHint",
  cafe: "tpl.cafeHint",
  carwash: "tpl.carwashHint",
} as const;
/** Clicking a template writes this sentence into the prompt, ready to edit. */
const TPL_PROMPT = {
  salon: "tpl.salonPrompt",
  cafe: "tpl.cafePrompt",
  carwash: "tpl.carwashPrompt",
} as const;

/** 901234567 -> "90 123 45 67" */
function groupPhone(digits: string): string {
  return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)]
    .filter(Boolean)
    .join(" ");
}

export interface CreateRequest {
  name: string;
  phoneNational: string;
  kind: ProjectKind;
  /** The operator's own words, carried through so the build log can quote them. */
  brief: string;
  taglineRu?: string;
  taglineUz?: string;
}

interface Props {
  onCreate: (request: CreateRequest) => void;
  busy: boolean;
  /** Set once provisioning has reported its result. */
  created: SessionCard | null;
  error: string | null;
  onReset: () => void;
}

/** Enough characters to be a brief rather than a stray keystroke. */
const MIN_PROMPT = 8;

/** A round trip to the model is optional, so it may not hold the form hostage. */
const AI_TIMEOUT_MS = 15_000;

type AiField = "kind" | "name" | "phoneNational";

/** "custom" is never proposed: it says nothing the form does not already know. */
type AiKind = Exclude<ProjectKind, "custom">;

/** What the model may propose. Empty values simply mean "nothing to add". */
interface AiSuggestions {
  kind?: AiKind;
  name: string;
  phoneNational: string;
}

type AiState =
  | { phase: "idle" }
  | { phase: "asking" }
  /** Proposals from the answered request; none of them is applied. */
  | { phase: "ready"; suggestions: AiSuggestions }
  | { phase: "failed" };

const ALLOWED_KINDS: AiKind[] = ["salon", "cafe", "carwash"];

/**
 * Reads the endpoint's answer defensively. Anything unexpected is dropped
 * rather than rendered: an unknown trade, a non-string name or a phone that is
 * not nine digits never becomes a proposal the operator could accept.
 */
function readSuggestions(payload: unknown): AiSuggestions | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const body = payload as { kind?: unknown; name?: unknown; phoneNational?: unknown };

  const suggestions: AiSuggestions = { name: "", phoneNational: "" };
  if (typeof body.kind === "string" && ALLOWED_KINDS.includes(body.kind as AiKind)) {
    suggestions.kind = body.kind as AiKind;
  }
  if (typeof body.name === "string") suggestions.name = body.name.trim().slice(0, 80);
  if (typeof body.phoneNational === "string") {
    const digits = body.phoneNational.replace(/\D/g, "").replace(/^998/, "");
    if (/^\d{9}$/.test(digits)) suggestions.phoneNational = digits;
  }

  return suggestions.kind || suggestions.name || suggestions.phoneNational ? suggestions : null;
}

/** One proposal, next to the value the field holds right now. */
interface AiRow {
  field: AiField;
  label: string;
  current: string;
  proposed: string;
  /** True when the operator typed this field, so applying would replace it. */
  manual: boolean;
}

/** Headline for an outcome that is not a save. Mirrors lib/save-state.ts. */
const SAVE_HEADLINE = {
  saved: "save.saved",
  "not-saved": "save.notSaved",
  unavailable: "save.unavailable",
  unknown: "save.unknown",
} as const;

export function CommandCenter({ onCreate, busy, created, error, onReset }: Props) {
  const { t, tr } = useI18n();

  const [prompt, setPrompt] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [touched, setTouched] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<CreateRequest | null>(null);

  /* Optional second opinion. Idle until the operator asks for it, and never
     consulted while the project is being created. */
  const [ai, setAi] = useState<AiState>({ phase: "idle" });
  const [aiApplied, setAiApplied] = useState<AiField[]>([]);
  const aiRequest = useRef(0);
  /** A trade the operator accepted from the model; cleared when the brief changes. */
  const [kindOverride, setKindOverride] = useState<ProjectKind | null>(null);

  /* The two detail fields follow the prompt until the operator types in them,
     after which the typed value wins — otherwise editing the prompt would
     silently overwrite a correction. */
  const [nameEdited, setNameEdited] = useState(false);
  const [phoneEdited, setPhoneEdited] = useState(false);

  // Cheap enough to re-read on every keystroke: no network, no model.
  const brief = useMemo(() => readBrief(prompt), [prompt]);

  const name = nameEdited ? nameInput : brief.name;
  const phoneDigits = (
    phoneEdited ? phoneInput.replace(/\D/g, "").replace(/^998/, "") : brief.phoneNational
  ).slice(0, 9);

  /* The kind is read back out of the prompt: a template click fills the prompt,
     and the matching card lights up because the words are now in there. The
     override exists only for a trade the operator accepted from the model, and
     it is cleared whenever the brief changes. */
  const kind = kindOverride ?? brief.kind;

  const promptValid = prompt.trim().length >= MIN_PROMPT;
  const nameValid = name.trim().length >= 2;
  const phoneValid = /^\d{9}$/.test(phoneDigits);

  // The same slug function the server uses, so the preview cannot disagree
  // with the subdomain the API hands back.
  const slug = useMemo(() => slugify(name), [name]);

  const template = TEMPLATES.find((item) => item.kind === kind);

  /* The proposal panel lists the suggestions that still differ from the form.
     Applied ones stay listed as "applied" so the change is never silent. */
  const aiRows = useMemo<AiRow[]>(() => {
    if (ai.phase !== "ready") return [];
    const { suggestions } = ai;
    const rows: AiRow[] = [];

    if (suggestions.name) {
      rows.push({
        field: "name",
        label: t("form.name"),
        current: name.trim(),
        proposed: suggestions.name,
        manual: nameEdited,
      });
    }
    if (suggestions.phoneNational) {
      rows.push({
        field: "phoneNational",
        label: t("form.phone"),
        current: phoneDigits ? `+998 ${groupPhone(phoneDigits)}` : "",
        proposed: `+998 ${groupPhone(suggestions.phoneNational)}`,
        manual: phoneEdited,
      });
    }
    if (suggestions.kind) {
      rows.push({
        field: "kind",
        label: t("form.kind"),
        current: template ? t(TPL_LABEL[template.kind]) : t("tpl.custom"),
        proposed: t(TPL_LABEL[suggestions.kind]),
        manual: false,
      });
    }

    return rows;
  }, [ai, name, phoneDigits, nameEdited, phoneEdited, template, t]);

  /* A proposal that already matches the field is not a choice, so it is not
     offered as one. Applied rows stay to confirm what changed. */
  const visibleAiRows = aiRows.filter(
    (row) => row.current !== row.proposed || aiApplied.includes(row.field),
  );

  /* A custom build has no canned tagline, so the operator's own sentence is
     used rather than mislabelling the tenant as a beauty salon. It is not
     translated: inventing an Uzbek rendering of their words would be worse
     than showing what they actually wrote. */
  const ownWords = prompt.trim().replace(/\s+/g, " ").slice(0, 120);
  const taglineRu = template?.tagline.ru ?? ownWords;
  const taglineUz = template?.tagline.uz ?? ownWords;

  /** Forgets proposals made about an older brief; a late answer is discarded. */
  function dropSuggestions() {
    aiRequest.current += 1;
    setAi({ phase: "idle" });
    setAiApplied([]);
  }

  /**
   * The only place the model is called. It is a request from the operator, not
   * a step of creation: nothing here can start or block a project.
   */
  async function askAi() {
    const text = prompt.trim();
    if (text.length < MIN_PROMPT || busy) return;

    const request = aiRequest.current + 1;
    aiRequest.current = request;
    setAi({ phase: "asking" });
    setAiApplied([]);

    try {
      const response = await fetch("/api/ai/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: text }),
        cache: "no-store",
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });
      // A key, a provider status or an internal message never reaches this UI:
      // every failure collapses into one plain "unavailable" line.
      if (!response.ok) throw new Error("unavailable");
      const suggestions = readSuggestions(await response.json());
      if (request !== aiRequest.current) return;
      setAi(suggestions ? { phase: "ready", suggestions } : { phase: "failed" });
    } catch {
      if (request !== aiRequest.current) return;
      setAi({ phase: "failed" });
    }
  }

  /** One field at a time, and only because this button was pressed. */
  function applySuggestion(field: AiField) {
    if (ai.phase !== "ready") return;
    const { suggestions } = ai;

    if (field === "name" && suggestions.name) {
      setNameEdited(true);
      setNameInput(suggestions.name);
    }
    if (field === "phoneNational" && suggestions.phoneNational) {
      setPhoneEdited(true);
      setPhoneInput(suggestions.phoneNational);
    }
    if (field === "kind" && suggestions.kind) setKindOverride(suggestions.kind);

    setAiApplied((applied) => (applied.includes(field) ? applied : [...applied, field]));
    // The reviewed values are stale the moment one of them changes.
    setPendingRequest(null);
  }

  function submit() {
    setTouched(true);
    if (!promptValid || !nameValid || !phoneValid) return;
    const request: CreateRequest = {
      name: name.trim(),
      phoneNational: phoneDigits,
      kind,
      brief: prompt.trim(),
      taglineRu,
      taglineUz,
    };
    if (pendingRequest) {
      onCreate(pendingRequest);
      setPendingRequest(null);
      return;
    }
    setPendingRequest(request);
  }

  function startOver() {
    setPrompt("");
    setNameInput("");
    setPhoneInput("");
    setNameEdited(false);
    setPhoneEdited(false);
    setTouched(false);
    setPendingRequest(null);
    setKindOverride(null);
    dropSuggestions();
    onReset();
  }

  if (created) {
    /* The headline states the save outcome, not merely that the run ended.
       "Запись салона создана" is reserved for a row that is actually in the
       database; anything else says so in the heading rather than burying it
       in a note under a success message. */
    const saveState = classifySave(created);
    const stored = isSaved(saveState);

    return (
      <section className="flex h-full min-h-0 flex-col overflow-y-auto">
        <div className="px-6 py-10">
          <p className="font-display text-[26px] leading-tight font-bold tracking-[-0.03em]">
            {stored ? t("form.created") : t(SAVE_HEADLINE[saveState])}
          </p>

          <p
            className={cx(
              "mt-4 font-mono text-[15px] break-all",
              stored ? "text-brand" : "text-ink-muted",
            )}
          >
            {created.subdomain}
          </p>

          <SaveNotice
            state={saveState}
            warning={created.warning}
            className="mt-5 max-w-[48ch]"
          />

          {!stored && (
            <p className="mt-3 max-w-[48ch] text-[13px] leading-snug text-ink-muted">
              {t("console.tenantUnsaved")}
            </p>
          )}

          {created.builder && (
            <p className="mt-3 max-w-[48ch] text-[13px] leading-snug text-ink-muted">
              {t("b.createdHint")}
            </p>
          )}

          <div className="mt-7 flex flex-wrap items-center gap-2">
            {/* Offered whenever a site draft exists to open. The public page is
                not linked from here: nothing is public until it is published
                from the builder. */}
            {created.builder && (
              <Link
                href={created.builder}
                className="glaze-brand rounded-tile px-6 py-3.5 text-[15px] font-semibold text-brand-ink hover:bg-brand-strong"
              >
                {t("b.open")}
              </Link>
            )}
            <Button variant="secondary" onClick={startOver}>
              {t("form.another")}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="px-6 pt-6 pb-5">
        <h1 className="font-display text-[26px] leading-tight font-bold tracking-[-0.03em]">
          {t("console.command")}
        </h1>
        <p className="mt-2 max-w-[52ch] text-[14px] leading-snug text-ink-muted">
          {t("console.commandHint")}
        </p>
      </div>

      {/* --------------------------------------------------------- the prompt --- */}
      <div className="px-6">
        <label className="block">
          <span className="block text-[13px] text-ink-muted">{t("console.promptLabel")}</span>
          <textarea
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setPendingRequest(null);
              setKindOverride(null);
              dropSuggestions();
            }}
            placeholder={t("console.promptPlaceholder")}
            rows={4}
            disabled={busy}
            spellCheck={false}
            className="mt-1.5 w-full resize-y rounded-card border border-hairline bg-surface-raised px-4 py-3 text-[15px] leading-relaxed outline-none placeholder:text-ink-muted/60 focus:border-brand disabled:opacity-60"
          />
        </label>
        <p className="mt-1.5 text-[12px] leading-snug text-ink-muted">
          {touched && !promptValid ? (
            <span className="text-accent">{t("form.errPrompt")}</span>
          ) : (
            t("console.promptHint")
          )}
        </p>

        {/* Asked for on purpose, never while typing or on create. A failed or
            slow answer leaves the form exactly as it is. */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || ai.phase === "asking" || !promptValid}
            onClick={() => void askAi()}
          >
            {ai.phase === "asking" ? t("ai.asking") : t("ai.ask")}
          </Button>
          <span className="text-[12px] leading-snug text-ink-muted">{t("ai.askHint")}</span>
        </div>
      </div>

      {/* ---------------------------------------------------- quick templates --- */}
      <div className="mt-6 px-6">
        <h2 className="font-display text-[13px] font-semibold text-ink-muted">
          {t("console.templates")}
        </h2>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {TEMPLATES.map((item) => {
            // Lit because the prompt currently reads as this trade, which is
            // also how a hand-typed prompt gets its card highlighted.
            const active = kind === item.kind;
            return (
              <button
                key={item.kind}
                type="button"
                aria-pressed={active}
                disabled={busy}
                onClick={() => {
                  setPrompt(t(TPL_PROMPT[item.kind]));
                  setPendingRequest(null);
                  setKindOverride(null);
                  dropSuggestions();
                }}
                className={cx(
                  "rounded-card border p-4 text-left transition-colors duration-150 disabled:opacity-60",
                  active
                    ? "border-brand bg-brand-tint"
                    : "border-hairline bg-surface-raised hover:border-hairline-strong",
                )}
              >
                <span
                  aria-hidden
                  className={cx(
                    "grid size-9 place-items-center rounded-tile font-display text-[15px] font-semibold",
                    active ? "glaze-brand text-brand-ink" : "bg-brand-tint text-brand",
                  )}
                >
                  {t(TPL_LABEL[item.kind]).charAt(0)}
                </span>
                <span className="mt-3 block font-display text-[14px] font-semibold tracking-[-0.01em]">
                  {t(TPL_LABEL[item.kind])}
                </span>
                <span className="mt-1 block text-[12px] leading-snug text-ink-muted">
                  {t(TPL_HINT[item.kind])}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------- what the brief gave --- */}
      <div className="mt-7 border-t border-hairline px-6 pt-5 pb-8">
        <h2 className="font-display text-[13px] font-semibold text-ink-muted">
          {brief.name || brief.phoneNational || kind !== "custom"
            ? t("console.detected")
            : t("console.detectedNothing")}
        </h2>

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="flex items-baseline gap-2">
              <span className="text-[13px] text-ink-muted">{t("form.name")}</span>
              {!nameEdited && brief.name && (
                <span className="font-mono text-[10px] text-brand">
                  {t("console.fromPrompt")}
                </span>
              )}
            </span>
            <input
              value={name}
              onChange={(e) => {
                setNameEdited(true);
                setNameInput(e.target.value);
                setPendingRequest(null);
              }}
              placeholder={t("form.namePlaceholder")}
              disabled={busy}
              className="mt-1.5 w-full rounded-card border border-hairline bg-surface-raised px-4 py-3 text-[16px] outline-none placeholder:text-ink-muted/60 focus:border-brand disabled:opacity-60"
            />
            {touched && !nameValid && (
              <span className="mt-1.5 block text-[12px] text-accent">{t("form.errName")}</span>
            )}
          </label>

          <label className="block">
            <span className="flex items-baseline gap-2">
              <span className="text-[13px] text-ink-muted">{t("form.phone")}</span>
              {!phoneEdited && brief.phoneNational && (
                <span className="font-mono text-[10px] text-brand">
                  {t("console.fromPrompt")}
                </span>
              )}
            </span>
            {/* Country code is fixed: every business here is on +998. */}
            <span className="mt-1.5 flex items-center rounded-card border border-hairline bg-surface-raised focus-within:border-brand">
              <span className="pl-4 text-[16px] font-semibold text-ink-muted tabular-nums">
                +998
              </span>
              <input
                value={groupPhone(phoneDigits)}
                onChange={(e) => {
                  setPhoneEdited(true);
                  setPhoneInput(e.target.value);
                  setPendingRequest(null);
                }}
                placeholder="90 123 45 67"
                inputMode="numeric"
                autoComplete="tel-national"
                disabled={busy}
                className="w-full bg-transparent px-3 py-3 text-[16px] tabular-nums outline-none placeholder:text-ink-muted/60 disabled:opacity-60"
              />
            </span>
            {touched && !phoneValid && (
              <span className="mt-1.5 block text-[12px] text-accent">{t("form.errPhone")}</span>
            )}
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
          <div>
            <span className="block text-[13px] text-ink-muted">{t("form.subdomain")}</span>
            <p className="mt-1 font-mono text-[15px] break-all">
              {slug ? (
                <>
                  <span className="text-ink">{slug}</span>
                  <span className="text-ink-muted">.{ROOT_DOMAIN}</span>
                </>
              ) : (
                <span className="text-ink-muted/60">{t("form.subdomainEmpty")}</span>
              )}
            </p>
          </div>

          <div>
            <span className="block text-[13px] text-ink-muted">{t("form.kind")}</span>
            <p className="mt-1 text-[15px]">
              {template ? t(TPL_LABEL[template.kind]) : t("tpl.custom")}
            </p>
          </div>
        </div>

        {template && (
          <p className="mt-4 max-w-[56ch] text-[12px] leading-snug text-ink-muted">
            {tr(template.tagline)}
          </p>
        )}

        {/* Proposals live in their own card, next to the fields but never
            inside them: the form only changes when a row's button is pressed. */}
        {ai.phase === "failed" && (
          <p className="mt-4 max-w-[52ch] rounded-card border border-hairline bg-surface-sunken p-3 text-[12px] leading-snug text-ink-muted">
            {t("ai.unavailable")}
          </p>
        )}

        {ai.phase === "ready" && (
          <section
            aria-label={t("ai.title")}
            className="mt-4 rounded-card border border-saffron/50 bg-saffron/8 p-4"
          >
            <h3 className="font-display text-[13px] font-semibold">{t("ai.title")}</h3>
            <p className="mt-1 max-w-[52ch] text-[12px] leading-snug text-ink-muted">
              {t("ai.hint")}
            </p>

            {visibleAiRows.length === 0 ? (
              <p className="mt-3 text-[13px] leading-snug">{t("ai.empty")}</p>
            ) : (
              <ul className="mt-3 grid gap-3">
                {visibleAiRows.map((row) => {
                  const applied = aiApplied.includes(row.field) && row.current === row.proposed;
                  return (
                    <li
                      key={row.field}
                      className="flex flex-wrap items-start justify-between gap-2 border-t border-saffron/30 pt-3 first:border-t-0 first:pt-0"
                    >
                      <div className="min-w-0">
                        <span className="block text-[12px] text-ink-muted">{row.label}</span>
                        <span className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px]">
                          <span className="text-ink-muted">{t("ai.current")}</span>
                          <span className="break-all">
                            {row.current || t("ai.currentEmpty")}
                          </span>
                          <span aria-hidden className="text-ink-muted">
                            →
                          </span>
                          <span className="text-ink-muted">{t("ai.proposed")}</span>
                          <span className="font-semibold break-all">{row.proposed}</span>
                        </span>
                      </div>

                      {applied ? (
                        <span className="flex-none text-[12px] font-semibold text-brand">
                          {t("ai.applied")}
                        </span>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() => applySuggestion(row.field)}
                          className="flex-none"
                        >
                          {row.manual ? t("ai.replace") : t("ai.apply")}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {error && (
          <p className="mt-4 rounded-card border border-accent/40 bg-accent/8 p-3 font-mono text-[12px] break-words text-accent">
            {error}
          </p>
        )}

        {pendingRequest && (
          <div className="mt-5 rounded-card border border-brand/35 bg-brand/5 p-4">
            <p className="font-display text-[14px] font-semibold">{t("console.reviewTitle")}</p>
            <p className="mt-1 text-[13px] text-ink-muted">{t("console.reviewHint")}</p>
            <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
              <div><dt className="text-ink-muted">{t("form.name")}</dt><dd className="font-medium">{pendingRequest.name}</dd></div>
              <div><dt className="text-ink-muted">{t("form.phone")}</dt><dd className="font-medium">+998 {groupPhone(pendingRequest.phoneNational)}</dd></div>
              <div><dt className="text-ink-muted">{t("form.kind")}</dt><dd className="font-medium">{template ? t(TPL_LABEL[template.kind]) : t("tpl.custom")}</dd></div>
              <div><dt className="text-ink-muted">{t("form.subdomain")}</dt><dd className="font-mono">{slug}.{ROOT_DOMAIN}</dd></div>
            </dl>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          {pendingRequest && (
            <Button variant="secondary" disabled={busy} onClick={() => setPendingRequest(null)}>
              {t("console.reviewEdit")}
            </Button>
          )}
          <Button disabled={busy} onClick={submit}>
            {busy ? t("console.building") : pendingRequest ? t("console.confirmBuild") : t("console.build")}
          </Button>
        </div>
      </div>
    </section>
  );
}
