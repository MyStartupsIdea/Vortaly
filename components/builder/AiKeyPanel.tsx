"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import {
  removeOwnKey,
  saveOwnKey,
  type AiStatusView,
  type KeyFailure,
  type OwnKeyProvider,
} from "@/lib/api/builder";
import { useI18n } from "@/lib/i18n/provider";
import { cx } from "@/lib/cx";

/**
 * The hybrid AI allowance, as the owner sees it: how many free actions are
 * left, and a place to paste their own key once those run out.
 *
 * The key is typed into a password field, sent to the server once and never
 * shown again; the panel only ever displays its last four characters.
 */

const PROVIDERS: Array<{ id: OwnKeyProvider; label: string; getKeyUrl: string }> = [
  { id: "gemini", label: "Google Gemini", getKeyUrl: "https://aistudio.google.com/apikey" },
  { id: "groq", label: "Groq", getKeyUrl: "https://console.groq.com/keys" },
  { id: "openrouter", label: "OpenRouter", getKeyUrl: "https://openrouter.ai/keys" },
];

const PROVIDER_NAME: Record<OwnKeyProvider, string> = {
  gemini: "Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
};

export function AiKeyPanel({
  slug,
  status,
  open,
  onOpenChange,
  onChange,
  onUnauthorized,
}: {
  slug: string;
  status: AiStatusView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (status: AiStatusView) => void;
  onUnauthorized: () => void;
}) {
  const { t } = useI18n();
  const [provider, setProvider] = useState<OwnKeyProvider>("gemini");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  const fail = (reason: KeyFailure) => {
    if (reason === "unauthorized") return onUnauthorized();
    setMessage({ tone: "warn", text: t(`ai.err.${reason}`) });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || key.trim().length === 0) return;
    setBusy(true);
    setMessage(null);
    const result = await saveOwnKey(slug, provider, key.trim());
    setBusy(false);
    if (!result.ok) return fail(result.reason);
    setKey("");
    onChange(result.ai);
    onOpenChange(false);
    setMessage({ tone: "ok", text: t("ai.keySaved") });
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const result = await removeOwnKey(slug);
    setBusy(false);
    if (!result.ok) return fail(result.reason);
    onChange(result.ai);
    setMessage({ tone: "ok", text: t("ai.keyRemoved") });
  };

  if (!status) return null;

  const own = status.ownKey;
  const exhausted = !own && status.freeLeft === 0;
  const selected = PROVIDERS.find((entry) => entry.id === provider) ?? PROVIDERS[0];

  return (
    <div
      className={cx(
        "flex-none border-t px-4 py-2.5 text-[12px] leading-snug",
        exhausted ? "border-saffron/40 bg-saffron/10" : "border-hairline",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={cx("flex-1", exhausted ? "font-semibold text-ink" : "text-ink-muted")}>
          {own
            ? t("ai.ownKeyActive", { provider: PROVIDER_NAME[own.provider], hint: own.hint })
            : exhausted
              ? t("ai.keyRequired")
              : t("ai.freeLeft", { left: status.freeLeft, limit: status.freeLimit })}
        </span>
        {!open && status.ownKeysEnabled && (
          <button
            type="button"
            onClick={() => {
              setMessage(null);
              onOpenChange(true);
            }}
            className="font-semibold text-brand hover:underline"
          >
            {own ? t("ai.changeKey") : t("ai.addKey")}
          </button>
        )}
        {!open && own && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="font-semibold text-ink-muted hover:text-ink disabled:opacity-45"
          >
            {t("ai.removeKey")}
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={submit} className="mt-2.5 space-y-2.5">
          <p className="font-display text-[14px] font-bold text-ink">{t("ai.keyTitle")}</p>
          <p className="text-ink-muted">{t("ai.keyIntro")}</p>

          <div role="radiogroup" aria-label={t("ai.provider")} className="flex flex-wrap gap-1.5">
            {PROVIDERS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={provider === entry.id}
                onClick={() => setProvider(entry.id)}
                className={cx(
                  "rounded-full border px-3 py-1.5 font-semibold",
                  provider === entry.id
                    ? "border-brand bg-brand/8 text-ink"
                    : "border-hairline bg-surface-raised text-ink-muted",
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <a
            href={selected.getKeyUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-block font-semibold text-brand hover:underline"
          >
            {t("ai.getKey")} ({selected.label}) ↗
          </a>

          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            placeholder={t("ai.keyLabel")}
            aria-label={t("ai.keyLabel")}
            className="h-10 w-full rounded-card border border-hairline bg-surface-raised px-3 font-mono text-[13px] text-ink outline-none focus:border-brand"
          />

          <div className="flex gap-2">
            <Button type="submit" size="sm" className="px-4 py-2" disabled={busy || key.trim().length === 0}>
              {busy ? t("ai.checking") : t("ai.saveKey")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => {
                setKey("");
                setMessage(null);
                onOpenChange(false);
              }}
            >
              {t("ai.cancel")}
            </Button>
          </div>
        </form>
      )}

      {message && (
        <p role="status" className={cx("mt-1.5", message.tone === "ok" ? "text-brand" : "text-accent")}>
          {message.text}
        </p>
      )}
    </div>
  );
}
