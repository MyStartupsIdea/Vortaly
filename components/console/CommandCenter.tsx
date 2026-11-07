"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { SessionCard } from "@/components/console/ProjectPanel";
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

/* Three glazed tiles in each trade's colours — enough to tell the cards apart
   without introducing an icon set. */
const TPL_TILES: Record<keyof typeof TPL_LABEL, string[]> = {
  salon: ["bg-turquoise", "bg-pomegranate", "bg-saffron"],
  cafe: ["bg-saffron", "bg-petrol-soft", "bg-pomegranate"],
  carwash: ["bg-turquoise-deep", "bg-turquoise", "bg-saffron"],
};

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

export function CommandCenter({ onCreate, busy, created, error, onReset }: Props) {
  const { t, tr } = useI18n();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [kind, setKind] = useState<ProjectKind>("salon");
  const [touched, setTouched] = useState(false);

  const phoneDigits = phone.replace(/\D/g, "").replace(/^998/, "").slice(0, 9);
  const nameValid = name.trim().length >= 2;
  const phoneValid = /^\d{9}$/.test(phoneDigits);

  // The same slug function the server uses, so the preview cannot disagree
  // with the subdomain the API hands back.
  const slug = useMemo(() => slugify(name), [name]);

  const template = TEMPLATES.find((item) => item.kind === kind);

  function submit() {
    setTouched(true);
    if (!nameValid || !phoneValid) return;
    onCreate({
      name: name.trim(),
      phoneNational: phoneDigits,
      kind,
      taglineRu: template?.tagline.ru,
      taglineUz: template?.tagline.uz,
    });
  }

  if (created) {
    return (
      <section className="flex h-full min-h-0 flex-col overflow-y-auto">
        <div className="px-6 py-10">
          <p className="font-display text-[26px] leading-tight font-bold tracking-[-0.03em]">
            {t("form.created")}
          </p>

          <p className="mt-4 font-mono text-[15px] break-all text-brand">
            {created.subdomain}
          </p>

          {!created.persisted && (
            <p className="mt-4 max-w-[48ch] rounded-card border border-saffron/50 bg-saffron/10 p-3 text-[13px]">
              {t("run.notPersisted")}
              {created.warning ? ` — ${created.warning}` : ""}
            </p>
          )}

          <div className="mt-7 flex flex-wrap items-center gap-2">
            {/* Only offered when the row really landed: without a database there
                is no tenant to open, and a dead link would be worse than none. */}
            {created.persisted && (
              <Link
                href={`/${created.slug}`}
                className="glaze-brand rounded-full px-6 py-3.5 text-[15px] font-semibold text-brand-ink"
              >
                {t("form.openTenant")}
              </Link>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                setName("");
                setPhone("");
                setTouched(false);
                onReset();
              }}
            >
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
          {t("form.title")}
        </h1>
        <p className="mt-2 max-w-[52ch] text-[14px] leading-snug text-ink-muted">
          {t("form.hint")}
        </p>
      </div>

      <div className="space-y-5 px-6">
        <label className="block">
          <span className="block text-[13px] text-ink-muted">{t("form.name")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("form.namePlaceholder")}
            disabled={busy}
            className="mt-1.5 w-full rounded-card border border-hairline bg-surface-raised px-4 py-3 text-[16px] outline-none placeholder:text-ink-muted/60 focus:border-brand disabled:opacity-60"
          />
          {touched && !nameValid && (
            <span className="mt-1.5 block text-[12px] text-accent">{t("form.errName")}</span>
          )}
        </label>

        <label className="block">
          <span className="block text-[13px] text-ink-muted">{t("form.phone")}</span>
          {/* Country code is fixed: every business here is on +998. */}
          <span className="mt-1.5 flex items-center rounded-card border border-hairline bg-surface-raised focus-within:border-brand">
            <span className="pl-4 text-[16px] font-semibold text-ink-muted tabular-nums">
              +998
            </span>
            <input
              value={groupPhone(phoneDigits)}
              onChange={(e) => setPhone(e.target.value)}
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

        <div>
          <span className="block text-[13px] text-ink-muted">{t("form.subdomain")}</span>
          <p className="mt-1.5 font-mono text-[15px] break-all">
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

        {error && (
          <p className="rounded-card border border-accent/40 bg-accent/8 p-3 font-mono text-[12px] break-words text-accent">
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <Button disabled={busy} onClick={submit}>
            {busy ? t("form.sending") : t("form.submit")}
          </Button>
        </div>
      </div>

      <div className="mt-8 px-6 pb-8">
        <h2 className="font-display text-[13px] font-semibold text-ink-muted">
          {t("form.kind")}
        </h2>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {TEMPLATES.map((item) => {
            const active = kind === item.kind;
            return (
              <button
                key={item.kind}
                type="button"
                aria-pressed={active}
                disabled={busy}
                onClick={() => setKind(item.kind)}
                className={cx(
                  "rounded-card border p-4 text-left transition-colors duration-150 disabled:opacity-60",
                  active
                    ? "border-brand bg-brand/8"
                    : "border-hairline bg-surface-raised hover:border-ink-muted/40",
                )}
              >
                <span aria-hidden className="flex gap-1">
                  {TPL_TILES[item.kind].map((tint, i) => (
                    <span key={i} className={cx("size-3 rounded-tile", tint)} />
                  ))}
                </span>
                <span className="mt-3 block font-display text-[14px] font-bold tracking-[-0.01em]">
                  {t(TPL_LABEL[item.kind])}
                </span>
                <span className="mt-1 block text-[12px] leading-snug text-ink-muted">
                  {t(TPL_HINT[item.kind])}
                </span>
              </button>
            );
          })}
        </div>

        {template && (
          <p className="mt-3 max-w-[56ch] text-[12px] leading-snug text-ink-muted">
            {tr(template.tagline)}
          </p>
        )}
      </div>
    </section>
  );
}
