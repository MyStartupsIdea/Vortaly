"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AiKeyPanel } from "@/components/builder/AiKeyPanel";
import { ContentEditor } from "@/components/builder/ContentEditor";
import { SharePanel } from "@/components/builder/SharePanel";
import { TenantSite } from "@/components/tma/TenantSite";
import { Button } from "@/components/ui/Button";
import {
  aiEdit,
  fetchAiStatus,
  fetchSite,
  generateSite,
  publishSite,
  saveSpec,
  type AiStatusView,
  type LoadSite,
  type Viewer,
  type StaffWarning,
} from "@/lib/api/builder";
import { createOwnerInvite } from "@/lib/api/owner";
import { unlockAdmin } from "@/lib/api/salons";
import type { SiteSpec } from "@/lib/builder/spec";
import { ROOT_DOMAIN } from "@/lib/data/projects";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { cx } from "@/lib/cx";

/**
 * The site builder for one tenant: an AI editor and a manual editor on the
 * left, the real tenant page on the right.
 *
 * The preview is not a mock-up. It renders the draft through the same
 * component the public page uses, so "what I see here" and "what a customer
 * gets after Publish" cannot drift apart.
 */

const SAVE_DELAY_MS = 700;
const UNDO_DEPTH = 20;

type SaveStatus = "saved" | "saving" | "error";

interface ChatMessage {
  from: "you" | "ai" | "system";
  text: string;
  /** For AI answers: whether the draft actually changed. */
  changed?: boolean;
}

const CHIPS: MessageKey[] = ["b.chip1", "b.chip2", "b.chip3", "b.chip4"];

const STAFF_WARNING: Record<StaffWarning, MessageKey> = {
  no_database: "b.warnNoDatabase",
  no_tenant: "b.warnNoTenant",
  unavailable: "b.warnStaffUnavailable",
};

export function BuilderApp({ slug }: { slug: string }) {
  const { t, tr } = useI18n();

  const [load, setLoad] = useState<LoadSite | { status: "loading" }>({ status: "loading" });
  /** The working copy, exactly as typed. */
  const [spec, setSpec] = useState<SiteSpec | null>(null);
  /** The draft as the server last stored it (cleaned). */
  const [serverDraft, setServerDraft] = useState<SiteSpec | null>(null);
  const [published, setPublished] = useState<SiteSpec | null>(null);
  const [storage, setStorage] = useState<"supabase" | "file">("supabase");

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [tab, setTab] = useState<"chat" | "content">("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [history, setHistory] = useState<SiteSpec[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [ai, setAi] = useState<AiStatusView | null>(null);
  const [keyOpen, setKeyOpen] = useState(false);
  const [viewer, setViewer] = useState<Viewer>("admin");
  const [inviting, setInviting] = useState(false);
  const [sharing, setSharing] = useState(false);

  const pending = useRef<SiteSpec | null>(null);
  const timer = useRef<number | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);

  const refreshAi = useCallback(async () => {
    setAi(await fetchAiStatus(slug));
  }, [slug]);

  const reload = useCallback(async () => {
    setLoad({ status: "loading" });
    void refreshAi();
    const result = await fetchSite(slug);
    setLoad(result);
    if (result.status === "ok" || result.status === "no_site") setViewer(result.viewer);
    if (result.status === "ok") {
      setSpec(result.site.draft);
      setServerDraft(result.site.draft);
      setPublished(result.site.published);
      setStorage(result.site.storage);
      setSaveStatus("saved");
    }
  }, [refreshAi, slug]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [messages, thinking]);

  /* ------------------------------------------------------------- saving --- */

  /** Sends whatever is waiting right now. Resolves to whether it was stored. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const next = pending.current;
    if (!next) return true;
    pending.current = null;

    setSaveStatus("saving");
    const result = await saveSpec(slug, next);
    if (!result.ok) {
      // Kept for the next attempt, unless something newer is already waiting.
      if (!pending.current) pending.current = next;
      setSaveStatus("error");
      if (result.reason === "unauthorized") setLoad({ status: "unauthorized" });
      return false;
    }
    setServerDraft(result.site.draft);
    // A newer edit may have queued while this one was in flight.
    setSaveStatus(pending.current ? "saving" : "saved");
    return true;
  }, [slug]);

  /** A manual edit: shown at once, saved after a pause in typing. */
  const edit = useCallback(
    (next: SiteSpec, remember = true) => {
      if (remember && spec) {
        const before = spec;
        setHistory((stack) => [...stack.slice(-(UNDO_DEPTH - 1)), before]);
      }
      setSpec(next);
      pending.current = next;
      setSaveStatus("saving");
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush, spec],
  );

  // Leaving with an unsent edit would lose it silently.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (pending.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  /* ----------------------------------------------------------- ai editor --- */

  const ask = useCallback(
    async (text: string) => {
      const instruction = text.trim();
      if (instruction.length < 3 || thinking || !spec) return;

      setInput("");
      setMessages((list) => [...list, { from: "you", text: instruction }]);
      setThinking(true);

      // The model edits the stored draft, so local edits must land first.
      const stored = await flush();
      if (!stored) {
        setThinking(false);
        setMessages((list) => [...list, { from: "system", text: t("b.saveError") }]);
        return;
      }

      const before = spec;
      const result = await aiEdit(slug, instruction);
      setThinking(false);
      void refreshAi();

      if (!result.ok) {
        if (result.reason === "unauthorized") setLoad({ status: "unauthorized" });
        // No allowance and no key, or a key its provider refused: ask for one.
        if (result.reason === "key_required" || result.reason === "key_rejected") setKeyOpen(true);
        setMessages((list) => [
          ...list,
          {
            from: "system",
            text:
              result.reason === "key_required"
                ? t("ai.keyRequired")
                : result.reason === "key_rejected"
                  ? t("ai.keyRejectedRun")
                  : result.reason === "ai"
                    ? t("b.aiDown")
                    : t("b.requestFailed"),
          },
        ]);
        return;
      }

      if (result.changed) {
        setHistory((stack) => [...stack.slice(-(UNDO_DEPTH - 1)), before]);
        setSpec(result.spec);
        setServerDraft(result.spec);
      }
      setMessages((list) => [
        ...list,
        {
          from: "ai",
          text: tr(result.reply) || (result.changed ? t("b.changed") : t("b.noChange")),
          changed: result.changed,
        },
      ]);
    },
    [flush, refreshAi, slug, spec, t, thinking, tr],
  );

  const undo = useCallback(() => {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory(history.slice(0, -1));
    edit(previous, false);
  }, [edit, history]);

  /* ------------------------------------------------------------- publish --- */

  const publish = useCallback(async () => {
    if (publishing) return;
    setPublishing(true);
    setNotice(null);

    const stored = await flush();
    if (!stored) {
      setPublishing(false);
      setNotice({ tone: "warn", text: t("b.saveError") });
      return;
    }

    const result = await publishSite(slug);
    setPublishing(false);

    if (!result.ok) {
      if (result.reason === "unauthorized") setLoad({ status: "unauthorized" });
      setNotice({
        tone: "warn",
        text: result.reason === "schema" ? t("b.schemaMissing") : t("b.publishFailed"),
      });
      return;
    }

    setPublished(result.site.published);
    setServerDraft(result.site.draft);
    setStorage(result.site.storage);
    setNotice(
      result.staffSynced
        ? { tone: "ok", text: t("b.publishedOk") }
        : { tone: "warn", text: t(STAFF_WARNING[result.staffWarning ?? "unavailable"]) },
    );
    // The next thing an owner needs is the link to send to customers.
    setSharing(true);
  }, [flush, publishing, slug, t]);

  /* -------------------------------------------------------------- invite --- */

  const invite = useCallback(async () => {
    if (inviting) return;
    setInviting(true);
    const result = await createOwnerInvite(slug);
    setInviting(false);
    if (!result.ok) {
      setNotice({ tone: "warn", text: t("o.inviteFailed") });
      return;
    }
    try {
      await navigator.clipboard.writeText(result.url);
    } catch {
      // Copying is a convenience; the link is shown in full either way.
    }
    setNotice({ tone: "ok", text: t("o.inviteReady", { url: result.url }) });
  }, [inviting, slug, t]);

  /* ---------------------------------------------------------- non-ready --- */

  if (load.status === "loading") {
    return <Centered>{t("b.loading")}</Centered>;
  }

  if (load.status === "unauthorized") {
    return <Unlock slug={slug} onUnlocked={() => void reload()} />;
  }

  if (load.status === "no_site") {
    return (
      <Generate
        slug={slug}
        name={load.tenant.name}
        home={load.viewer === "owner" ? "/owner" : "/"}
        ai={ai}
        onAiChange={setAi}
        onDone={() => void reload()}
        onUnauthorized={() => setLoad({ status: "unauthorized" })}
      />
    );
  }

  if (load.status === "not_found" || load.status === "error" || !spec) {
    return (
      <Centered>
        <p className="font-display text-[17px] font-bold">
          {load.status === "not_found" ? t("b.notFound") : t("b.loadError")}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void reload()}>
            {t("action.retry")}
          </Button>
          <Link
            href="/"
            className="rounded-card border border-hairline px-2.5 py-1.5 text-[12px] font-semibold"
          >
            {t("b.back")}
          </Link>
        </div>
      </Centered>
    );
  }

  /* --------------------------------------------------------------- ready --- */

  const unpublished =
    saveStatus !== "saved" || JSON.stringify(serverDraft) !== JSON.stringify(published);

  return (
    <div className="flex min-h-screen flex-col bg-surface-sunken lg:h-dvh lg:overflow-hidden">
      <header className="flex flex-none flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline bg-surface px-4 py-2.5 lg:px-5">
        <Link
          href={viewer === "owner" ? "/owner" : "/"}
          className="text-[12px] font-semibold text-ink-muted hover:text-ink"
        >
          ← {viewer === "owner" ? t("o.myBusinesses") : t("b.back")}
        </Link>

        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[16px] leading-tight font-bold tracking-[-0.02em]">
            {spec.name}
          </p>
          <p className="truncate font-mono text-[11px] text-ink-muted">
            {slug}.{ROOT_DOMAIN}
          </p>
        </div>

        <span
          role="status"
          className={cx(
            "text-[12px] tabular-nums",
            saveStatus === "error" ? "font-semibold text-accent" : "text-ink-muted",
          )}
        >
          {saveStatus === "saving"
            ? t("b.saving")
            : saveStatus === "error"
              ? t("b.saveError")
              : t("b.saved")}
        </span>

        <span className="flex items-center gap-1.5 text-[12px]">
          <span
            aria-hidden
            className={cx(
              "size-2 rounded-full",
              !published ? "bg-ink-muted/50" : unpublished ? "bg-saffron" : "bg-brand",
            )}
          />
          {!published ? t("b.neverPublished") : unpublished ? t("b.unpublished") : t("b.live")}
        </span>

        {viewer === "admin" && (
          <button
            type="button"
            disabled={inviting}
            onClick={() => void invite()}
            className="rounded-card border border-hairline bg-surface-raised px-2.5 py-1.5 text-[12px] font-semibold disabled:opacity-45"
          >
            {t("o.invite")}
          </button>
        )}

        {published && (
          <button
            type="button"
            onClick={() => setSharing((open) => !open)}
            className="rounded-card border border-hairline bg-surface-raised px-2.5 py-1.5 text-[12px] font-semibold"
          >
            {t("share.button")}
          </button>
        )}

        {published && (
          <Link
            href={`/${slug}`}
            target="_blank"
            className="rounded-card border border-hairline bg-surface-raised px-2.5 py-1.5 text-[12px] font-semibold"
          >
            {t("b.openSite")}
          </Link>
        )}

        <Button
          size="sm"
          className="px-4 py-2"
          disabled={publishing || (!unpublished && Boolean(published))}
          onClick={() => void publish()}
        >
          {publishing ? t("b.publishing") : t("b.publish")}
        </Button>
      </header>

      {sharing && published && <SharePanel slug={slug} name={spec.name} onClose={() => setSharing(false)} />}

      {(notice || storage === "file") && (
        <div className="flex-none space-y-px">
          {storage === "file" && (
            <p className="border-b border-saffron/40 bg-saffron/10 px-4 py-2 text-[12px] leading-snug lg:px-5">
              {t("b.storageFile")}
            </p>
          )}
          {notice && (
            <p
              role="status"
              className={cx(
                "border-b px-4 py-2 text-[12px] leading-snug lg:px-5",
                notice.tone === "ok"
                  ? "border-brand/30 bg-brand/8"
                  : "border-saffron/40 bg-saffron/10",
              )}
            >
              {notice.text}
            </p>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(340px,440px)_minmax(0,1fr)]">
        {/* ------------------------------------------------------- editors --- */}
        <div className="flex min-h-[520px] flex-col border-hairline bg-surface lg:min-h-0 lg:border-r">
          <div role="tablist" className="flex flex-none border-b border-hairline">
            {(["chat", "content"] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cx(
                  "flex-1 border-b-2 px-3 py-3 text-[13px] font-semibold",
                  tab === id ? "border-brand text-ink" : "border-transparent text-ink-muted",
                )}
              >
                {t(id === "chat" ? "b.tabChat" : "b.tabContent")}
              </button>
            ))}
            <button
              type="button"
              disabled={history.length === 0 || thinking}
              onClick={undo}
              className="flex-none px-4 text-[12px] font-semibold text-ink-muted hover:text-ink disabled:opacity-35"
            >
              ↶ {t("b.undo")}
            </button>
          </div>

          {tab === "content" ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ContentEditor spec={spec} onChange={(next) => edit(next)} />
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <p className="text-[13px] leading-snug text-ink-muted">{t("b.chatIntro")}</p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {CHIPS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      disabled={thinking}
                      onClick={() => void ask(t(key))}
                      className="rounded-full border border-hairline bg-surface-raised px-3 py-1.5 text-left text-[12px] font-medium hover:border-brand disabled:opacity-45"
                    >
                      {t(key)}
                    </button>
                  ))}
                </div>

                <ul className="mt-5 space-y-2.5">
                  {messages.map((message, i) => (
                    <li
                      key={i}
                      className={cx("flex", message.from === "you" ? "justify-end" : "justify-start")}
                    >
                      <span
                        className={cx(
                          "max-w-[88%] rounded-card px-3 py-2 text-[13px] leading-snug",
                          message.from === "you"
                            ? "glaze-brand text-brand-ink"
                            : message.from === "system"
                              ? "border border-accent/40 bg-accent/8 text-accent"
                              : "border border-hairline bg-surface-raised",
                        )}
                      >
                        {message.text}
                        {message.from === "ai" && (
                          <span
                            className={cx(
                              "mt-1 block text-[11px] font-semibold",
                              message.changed ? "text-brand" : "text-ink-muted",
                            )}
                          >
                            {message.changed ? t("b.changedTag") : t("b.noChangeTag")}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                  {thinking && (
                    <li className="flex justify-start">
                      <span className="rounded-card border border-hairline bg-surface-raised px-3 py-2 text-[13px] text-ink-muted motion-safe:animate-pulse">
                        {t("b.thinking")}
                      </span>
                    </li>
                  )}
                </ul>
                <div ref={chatEnd} />
              </div>

              <AiKeyPanel
                slug={slug}
                status={ai}
                open={keyOpen}
                onOpenChange={setKeyOpen}
                onChange={setAi}
                onUnauthorized={() => setLoad({ status: "unauthorized" })}
              />

              <form
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  void ask(input);
                }}
                className="flex flex-none items-end gap-2 border-t border-hairline p-3"
              >
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void ask(input);
                    }
                  }}
                  rows={2}
                  maxLength={1000}
                  placeholder={t("b.chatPlaceholder")}
                  aria-label={t("b.chatPlaceholder")}
                  disabled={thinking}
                  className="min-h-[44px] flex-1 resize-none rounded-card border border-hairline bg-surface-raised px-3 py-2.5 text-[14px] leading-snug outline-none placeholder:text-ink-muted/60 focus:border-brand disabled:opacity-60"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="px-4 py-3"
                  disabled={thinking || input.trim().length < 3}
                >
                  {t("b.send")}
                </Button>
              </form>
            </>
          )}
        </div>

        {/* ------------------------------------------------------- preview --- */}
        <div className="flex min-h-[720px] flex-col items-center gap-3 px-4 py-5 lg:min-h-0">
          <p className="flex-none text-[12px] text-ink-muted">{t("b.previewLabel")}</p>
          {/* The transform makes this box the containing block for anything
              positioned inside the page, so nothing escapes the phone frame. */}
          <div className="min-h-0 w-full max-w-[400px] flex-1 overflow-hidden rounded-[28px] border border-hairline bg-surface shadow-[0_12px_40px_rgb(15_46_44/0.14)] [transform:translateZ(0)]">
            <div className="h-full overflow-y-auto">
              <TenantSite spec={spec} preview />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- sub-views --- */

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-surface-sunken px-6">
      <div className="w-full max-w-[420px] text-center text-[14px] text-ink-muted">{children}</div>
    </div>
  );
}

/** Same exchange as the console: the secret goes to the server once, a cookie comes back. */
function Unlock({ slug, onUnlocked }: { slug: string; onUnlocked: () => void }) {
  const { t } = useI18n();
  const [operator, setOperator] = useState(false);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!secret || busy) return;
    setBusy(true);
    setFailure(null);
    const result = await unlockAdmin(secret);
    setBusy(false);
    if (result.ok) {
      setSecret("");
      onUnlocked();
      return;
    }
    setFailure(
      result.reason === "denied"
        ? t("list.unlockDenied")
        : result.reason === "throttled"
          ? t("list.unlockThrottled")
          : result.reason === "not_configured"
            ? t("list.notConfigured")
            : t("list.unlockUnreachable"),
    );
  };

  if (!operator) {
    return (
      <Centered>
        <div className="space-y-3 text-left">
          <p className="font-display text-[19px] font-bold text-ink">{t("o.title")}</p>
          <p className="text-[13px] leading-snug">{t("o.intro")}</p>
          <Link
            href={`/owner?next=${encodeURIComponent(`/builder/${slug}`)}`}
            className="glaze-brand block rounded-card px-4 py-3 text-center text-[14px] font-semibold text-brand-ink"
          >
            {t("o.ownerLogin")}
          </Link>
          <button
            type="button"
            onClick={() => setOperator(true)}
            className="block w-full text-center text-[12px] font-semibold text-ink-muted hover:text-ink"
          >
            {t("o.operatorLogin")}
          </button>
        </div>
      </Centered>
    );
  }

  return (
    <Centered>
      <form onSubmit={submit} className="space-y-3 text-left">
        <p className="font-display text-[19px] font-bold text-ink">{t("b.lockedTitle")}</p>
        <p className="text-[13px] leading-snug">{t("list.lockedHint")}</p>
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          placeholder={t("list.secretLabel")}
          aria-label={t("list.secretLabel")}
          className="h-11 w-full rounded-card border border-hairline bg-surface-raised px-3 font-mono text-[13px] text-ink outline-none focus:border-brand"
        />
        <Button type="submit" block disabled={busy || secret.length === 0}>
          {busy ? t("list.unlocking") : t("list.unlock")}
        </Button>
        {failure && (
          <p role="status" className="text-[12px] text-accent">
            {failure}
          </p>
        )}
      </form>
    </Centered>
  );
}

/** A tenant with no site yet: describe the business, get a first draft. */
function Generate({
  slug,
  name,
  home,
  ai,
  onAiChange,
  onDone,
  onUnauthorized,
}: {
  slug: string;
  name: string;
  home: string;
  ai: AiStatusView | null;
  onAiChange: (status: AiStatusView) => void;
  onDone: () => void;
  onUnauthorized: () => void;
}) {
  const { t } = useI18n();
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [keyOpen, setKeyOpen] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (brief.trim().length < 8 || busy) return;
    setBusy(true);
    setFailure(null);
    const result = await generateSite(slug, brief.trim());
    setBusy(false);
    if (result.ok) {
      onDone();
      return;
    }
    if (result.reason === "unauthorized") return onUnauthorized();
    if (result.reason === "key_required" || result.reason === "key_rejected") setKeyOpen(true);
    setFailure(
      result.reason === "schema"
        ? t("b.schemaMissing")
        : result.reason === "key_required"
          ? t("ai.keyRequired")
          : result.reason === "key_rejected"
            ? t("ai.keyRejectedRun")
            : t("b.requestFailed"),
    );
  };

  return (
    <Centered>
      <form onSubmit={submit} className="space-y-3 text-left">
        <p className="font-display text-[19px] font-bold text-ink">{name}</p>
        <p className="text-[13px] leading-snug">{t("b.noSite")}</p>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={4}
          maxLength={1500}
          disabled={busy}
          placeholder={t("console.promptPlaceholder")}
          aria-label={t("console.promptLabel")}
          className="w-full rounded-card border border-hairline bg-surface-raised px-3 py-2.5 text-[14px] leading-snug text-ink outline-none focus:border-brand"
        />
        <Button type="submit" block disabled={busy || brief.trim().length < 8}>
          {busy ? t("b.generating") : t("b.generate")}
        </Button>
        {failure && (
          <p role="status" className="text-[12px] text-accent">
            {failure}
          </p>
        )}
      </form>
      {/* Outside the brief form: the key panel is a form of its own. */}
      <div className="mt-3 overflow-hidden rounded-card border border-hairline bg-surface text-left">
        <AiKeyPanel
          slug={slug}
          status={ai}
          open={keyOpen}
          onOpenChange={setKeyOpen}
          onChange={onAiChange}
          onUnauthorized={onUnauthorized}
        />
      </div>
      <Link href={home} className="mt-3 block text-center text-[12px] font-semibold text-ink-muted">
        ← {t("b.back")}
      </Link>
    </Centered>
  );
}
