"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/lib/i18n/provider";

/**
 * What an owner does right after publishing: get the address to customers.
 * The link to copy, a ready Telegram share (the channel their customers are
 * on), and the page itself.
 *
 * The address is this host plus the slug: tenants open by path until the
 * root domain and its wildcard subdomains are set up.
 */
export function SharePanel({ slug, name, onClose }: { slug: string; name: string; onClose: () => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? `/${slug}` : `${window.location.origin}/${slug}`;
  const telegram = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(
    t("share.message", { name }),
  )}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the link is selectable right here.
    }
  };

  return (
    <div className="flex-none border-b border-brand/30 bg-brand/8 px-4 py-3 lg:px-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-[13px] font-semibold">{t("share.title")}</p>
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={t("share.title")}
          className="h-9 min-w-0 flex-1 rounded-card border border-hairline bg-surface-raised px-3 font-mono text-[12px] text-ink outline-none"
        />
        <Button size="sm" onClick={() => void copy()}>
          {copied ? t("share.copied") : t("share.copy")}
        </Button>
        <a
          href={telegram}
          target="_blank"
          rel="noreferrer noopener"
          className="rounded-card border border-hairline bg-surface-raised px-2.5 py-1.5 text-[12px] font-semibold"
        >
          {t("share.telegram")}
        </a>
        <button type="button" onClick={onClose} className="text-[12px] font-semibold text-ink-muted hover:text-ink">
          {t("ai.cancel")}
        </button>
      </div>
      <p className="mt-1.5 text-[12px] text-ink-muted">{t("share.hint")}</p>
    </div>
  );
}
