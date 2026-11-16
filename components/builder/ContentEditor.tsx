"use client";

import type { ReactNode } from "react";
import {
  LIMITS,
  THEMES,
  THEME_IDS,
  nextId,
  type SiteItem,
  type SiteSpec,
  type SiteStaff,
} from "@/lib/builder/spec";
import { formatWeekday } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import type { Translated } from "@/lib/types";
import { cx } from "@/lib/cx";

/**
 * Hand editing for everything the AI wrote. Every control edits the draft in
 * place; the parent debounces the save and the preview follows each keystroke.
 *
 * Values are kept exactly as typed. Cleaning (trimming, clamping, id checks)
 * happens on the server at save time: doing it here would eat the trailing
 * space of a word the operator has not finished typing.
 */

const FIELD =
  "w-full rounded-tile border border-hairline bg-surface-raised px-2.5 py-2 text-[13px] outline-none placeholder:text-ink-muted/55 focus:border-brand";
const LABEL = "block text-[11px] font-medium text-ink-muted";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

/** One bilingual value as two inputs, Russian first. */
function Bilingual({
  label,
  value,
  onChange,
  multiline,
  max,
}: {
  label: string;
  value: Translated;
  onChange: (next: Translated) => void;
  multiline?: boolean;
  max: number;
}) {
  const render = (locale: "ru" | "uz") => {
    const props = {
      value: value[locale],
      maxLength: max,
      "aria-label": `${label} (${locale.toUpperCase()})`,
      className: cx(FIELD, multiline && "min-h-[76px] resize-y leading-snug"),
    };
    return (
      <span className="flex items-start gap-1.5">
        <span className="mt-2 w-5 flex-none font-mono text-[10px] text-ink-muted uppercase">
          {locale}
        </span>
        {multiline ? (
          <textarea
            {...props}
            rows={3}
            onChange={(e) => onChange({ ...value, [locale]: e.target.value })}
          />
        ) : (
          <input {...props} onChange={(e) => onChange({ ...value, [locale]: e.target.value })} />
        )}
      </span>
    );
  };

  return (
    <div>
      <span className={LABEL}>{label}</span>
      <div className="mt-1 space-y-1">
        {render("ru")}
        {render("uz")}
      </div>
    </div>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-display text-[13px] font-bold tracking-[-0.01em]">{children}</h3>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-8 flex-none place-items-center rounded-tile text-ink-muted hover:bg-accent/10 hover:text-accent"
    >
      <svg viewBox="0 0 16 16" fill="none" className="size-3.5 stroke-current">
        <path d="M4 4l8 8M12 4l-8 8" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function AddButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-tile border border-dashed border-ink-muted/40 px-3 py-2 text-[12px] font-semibold text-ink-muted hover:border-brand hover:text-brand"
    >
      + {children}
    </button>
  );
}

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

export function ContentEditor({
  spec,
  onChange,
}: {
  spec: SiteSpec;
  onChange: (next: SiteSpec) => void;
}) {
  const { t, locale } = useI18n();

  const patch = (fields: Partial<SiteSpec>) => onChange({ ...spec, ...fields });

  const patchItem = (id: string, fields: Partial<SiteItem>) =>
    patch({ items: spec.items.map((item) => (item.id === id ? { ...item, ...fields } : item)) });

  const patchStaff = (id: string, fields: Partial<SiteStaff>) =>
    patch({ staff: spec.staff.map((member) => (member.id === id ? { ...member, ...fields } : member)) });

  const addItem = (categoryId: string) => {
    const id = nextId(`${spec.slug}-s`, spec.items.map((item) => item.id));
    patch({
      items: [
        ...spec.items,
        {
          id,
          categoryId,
          title: { ru: "", uz: "" },
          description: { ru: "", uz: "" },
          durationMin: 60,
          priceSum: 0,
          popular: false,
          bookable: true,
        },
      ],
      // Whoever does everything else does the new service too.
      staff: spec.staff.map((member) => ({ ...member, itemIds: [...member.itemIds, id] })),
    });
  };

  const removeItem = (id: string) =>
    patch({
      items: spec.items.filter((item) => item.id !== id),
      staff: spec.staff.map((member) => ({
        ...member,
        itemIds: member.itemIds.filter((itemId) => itemId !== id),
      })),
    });

  const addCategory = () =>
    patch({
      categories: [
        ...spec.categories,
        { id: nextId("c", spec.categories.map((c) => c.id)), title: { ru: "", uz: "" } },
      ],
    });

  const removeCategory = (id: string) =>
    patch({
      categories: spec.categories.filter((category) => category.id !== id),
      items: spec.items.filter((item) => item.categoryId !== id),
    });

  const addStaff = () =>
    patch({
      staff: [
        ...spec.staff,
        {
          id: nextId(`${spec.slug}-m`, spec.staff.map((member) => member.id)),
          name: "",
          role: { ru: "", uz: "" },
          workdays: [1, 2, 3, 4, 5, 6],
          shiftStart: spec.hours.from,
          shiftEnd: spec.hours.to,
          itemIds: spec.items.filter((item) => item.bookable).map((item) => item.id),
          tint: "#0E7C86",
        },
      ],
    });

  // Monday 1 January 2024 anchors the weekday names.
  const weekdayName = (day: number) => formatWeekday(new Date(2024, 0, day), locale);

  return (
    <div className="space-y-7 px-4 py-4">
      {/* --------------------------------------------------------- basics --- */}
      <section className="space-y-3">
        <Heading>{t("b.secBasics")}</Heading>

        <Field label={t("form.name")}>
          <input
            value={spec.name}
            maxLength={LIMITS.name}
            onChange={(e) => patch({ name: e.target.value })}
            className={FIELD}
          />
        </Field>

        <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2">
          <Field label={t("form.phone")}>
            <span className="flex items-center rounded-tile border border-hairline bg-surface-raised focus-within:border-brand">
              <span className="pl-2.5 text-[13px] text-ink-muted tabular-nums">+998</span>
              <input
                value={spec.phone}
                inputMode="numeric"
                maxLength={9}
                onChange={(e) => patch({ phone: e.target.value.replace(/\D/g, "").slice(0, 9) })}
                className="w-full bg-transparent px-1.5 py-2 text-[13px] tabular-nums outline-none"
              />
            </span>
          </Field>
          <Field label={t("b.hoursFrom")}>
            <input
              type="time"
              step={1800}
              value={spec.hours.from}
              onChange={(e) => patch({ hours: { ...spec.hours, from: e.target.value } })}
              className={FIELD}
            />
          </Field>
          <Field label={t("b.hoursTo")}>
            <input
              type="time"
              step={1800}
              value={spec.hours.to}
              onChange={(e) => patch({ hours: { ...spec.hours, to: e.target.value } })}
              className={FIELD}
            />
          </Field>
        </div>

        <div>
          <span className={LABEL}>{t("b.theme")}</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {THEME_IDS.map((id) => {
              const theme = THEMES[id];
              const active = spec.theme === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  title={theme.label[locale]}
                  onClick={() => patch({ theme: id })}
                  className={cx(
                    "flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1 text-[12px] font-semibold",
                    active ? "border-ink bg-surface-raised" : "border-hairline text-ink-muted",
                  )}
                >
                  <span
                    aria-hidden
                    className="flex size-5 overflow-hidden rounded-full"
                    style={{ backgroundColor: theme.header }}
                  >
                    <span className="h-full w-1/2" style={{ backgroundColor: theme.brand }} />
                  </span>
                  {theme.label[locale]}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- texts --- */}
      <section className="space-y-3">
        <Heading>{t("b.secTexts")}</Heading>
        <Bilingual
          label={t("b.tagline")}
          value={spec.tagline}
          max={LIMITS.tagline}
          onChange={(tagline) => patch({ tagline })}
        />
        <Bilingual
          label={t("b.about")}
          value={spec.about}
          max={LIMITS.about}
          multiline
          onChange={(about) => patch({ about })}
        />
        <Bilingual
          label={t("b.address")}
          value={spec.address}
          max={LIMITS.address}
          onChange={(address) => patch({ address })}
        />
      </section>

      {/* ---------------------------------------------------------- items --- */}
      <section className="space-y-4">
        <Heading>{t("b.secItems")}</Heading>

        {spec.categories.map((category) => (
          <div key={category.id} className="rounded-card border border-hairline bg-surface p-3">
            <div className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <Bilingual
                  label={t("b.category")}
                  value={category.title}
                  max={LIMITS.title}
                  onChange={(title) =>
                    patch({
                      categories: spec.categories.map((entry) =>
                        entry.id === category.id ? { ...entry, title } : entry,
                      ),
                    })
                  }
                />
              </div>
              {spec.categories.length > 1 && (
                <RemoveButton
                  label={t("b.removeCategory")}
                  onClick={() => removeCategory(category.id)}
                />
              )}
            </div>

            <ul className="mt-3 space-y-3">
              {spec.items
                .filter((item) => item.categoryId === category.id)
                .map((item) => (
                  <li key={item.id} className="border-t border-hairline pt-3">
                    <div className="flex items-start gap-1">
                      <div className="min-w-0 flex-1 space-y-1">
                        {(["ru", "uz"] as const).map((lang) => (
                          <span key={lang} className="flex items-center gap-1.5">
                            <span className="w-5 flex-none font-mono text-[10px] text-ink-muted uppercase">
                              {lang}
                            </span>
                            <input
                              value={item.title[lang]}
                              maxLength={LIMITS.title}
                              placeholder={t("b.itemTitle")}
                              aria-label={`${t("b.itemTitle")} (${lang.toUpperCase()})`}
                              onChange={(e) =>
                                patchItem(item.id, {
                                  title: { ...item.title, [lang]: e.target.value },
                                })
                              }
                              className={FIELD}
                            />
                          </span>
                        ))}
                      </div>
                      <RemoveButton label={t("b.removeItem")} onClick={() => removeItem(item.id)} />
                    </div>

                    <div className="mt-2 flex flex-wrap items-end gap-2 pl-[26px]">
                      <label className="block w-[112px]">
                        <span className={LABEL}>{t("b.price")}</span>
                        <input
                          value={item.priceSum === 0 ? "" : String(item.priceSum)}
                          inputMode="numeric"
                          placeholder="0"
                          onChange={(e) =>
                            patchItem(item.id, {
                              priceSum: Number(e.target.value.replace(/\D/g, "").slice(0, 9)) || 0,
                            })
                          }
                          className={cx(FIELD, "mt-1 tabular-nums")}
                        />
                      </label>
                      {item.bookable && (
                        <label className="block w-[76px]">
                          <span className={LABEL}>{t("b.duration")}</span>
                          <input
                            value={item.durationMin === 0 ? "" : String(item.durationMin)}
                            inputMode="numeric"
                            onChange={(e) =>
                              patchItem(item.id, {
                                durationMin:
                                  Number(e.target.value.replace(/\D/g, "").slice(0, 3)) || 0,
                              })
                            }
                            className={cx(FIELD, "mt-1 tabular-nums")}
                          />
                        </label>
                      )}
                      <label className="flex items-center gap-1.5 pb-2 text-[12px]">
                        <input
                          type="checkbox"
                          checked={item.bookable}
                          onChange={(e) =>
                            patchItem(item.id, {
                              bookable: e.target.checked,
                              durationMin: e.target.checked ? item.durationMin || 60 : 0,
                            })
                          }
                        />
                        {t("b.bookable")}
                      </label>
                      <label className="flex items-center gap-1.5 pb-2 text-[12px]">
                        <input
                          type="checkbox"
                          checked={item.popular}
                          onChange={(e) => patchItem(item.id, { popular: e.target.checked })}
                        />
                        {t("b.popular")}
                      </label>
                    </div>
                  </li>
                ))}
            </ul>

            <div className="mt-3">
              <AddButton onClick={() => addItem(category.id)}>{t("b.addItem")}</AddButton>
            </div>
          </div>
        ))}

        {spec.categories.length < LIMITS.categories && (
          <AddButton onClick={addCategory}>{t("b.addCategory")}</AddButton>
        )}
      </section>

      {/* ---------------------------------------------------------- staff --- */}
      <section className="space-y-3">
        <Heading>{t("b.secStaff")}</Heading>
        <p className="text-[12px] leading-snug text-ink-muted">{t("b.staffHint")}</p>

        {spec.staff.map((member) => (
          <div key={member.id} className="rounded-card border border-hairline bg-surface p-3">
            <div className="flex items-start gap-1">
              <div className="min-w-0 flex-1 space-y-2">
                <Field label={t("b.staffName")}>
                  <input
                    value={member.name}
                    maxLength={60}
                    onChange={(e) => patchStaff(member.id, { name: e.target.value })}
                    className={FIELD}
                  />
                </Field>
                <Bilingual
                  label={t("b.staffRole")}
                  value={member.role}
                  max={LIMITS.role}
                  onChange={(role) => patchStaff(member.id, { role })}
                />
              </div>
              <RemoveButton
                label={t("b.removeStaff")}
                onClick={() => patch({ staff: spec.staff.filter((s) => s.id !== member.id) })}
              />
            </div>

            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div>
                <span className={LABEL}>{t("b.workdays")}</span>
                <div className="mt-1 flex gap-1">
                  {WEEKDAYS.map((day) => {
                    const on = member.workdays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          patchStaff(member.id, {
                            workdays: on
                              ? member.workdays.filter((d) => d !== day)
                              : [...member.workdays, day].sort((a, b) => a - b),
                          })
                        }
                        className={cx(
                          "h-8 w-8 rounded-tile text-[11px] font-semibold",
                          on ? "glaze-brand text-brand-ink" : "border border-hairline text-ink-muted",
                        )}
                      >
                        {weekdayName(day)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="block w-[96px]">
                <span className={LABEL}>{t("b.hoursFrom")}</span>
                <input
                  type="time"
                  step={1800}
                  value={member.shiftStart}
                  onChange={(e) => patchStaff(member.id, { shiftStart: e.target.value })}
                  className={cx(FIELD, "mt-1")}
                />
              </label>
              <label className="block w-[96px]">
                <span className={LABEL}>{t("b.hoursTo")}</span>
                <input
                  type="time"
                  step={1800}
                  value={member.shiftEnd}
                  onChange={(e) => patchStaff(member.id, { shiftEnd: e.target.value })}
                  className={cx(FIELD, "mt-1")}
                />
              </label>
            </div>
          </div>
        ))}

        {spec.staff.length < LIMITS.staff && (
          <AddButton onClick={addStaff}>{t("b.addStaff")}</AddButton>
        )}
      </section>
    </div>
  );
}
