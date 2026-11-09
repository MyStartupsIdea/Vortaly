/**
 * One vocabulary for "did this actually get stored?", shared by the platform
 * console, the booking flow and the admin table.
 *
 * The rule the whole UI is built on: a request that completed is not the same
 * as a record that was saved. A finished stream, a 201 and an absent error all
 * mean the server answered — none of them mean Postgres holds a row. Every
 * surface that reports an outcome reads one of these states instead of
 * inferring success from "nothing went wrong".
 */
export type SaveState =
  /** Confirmed written and read back. Safe to call saved. */
  | "saved"
  /** The server answered and told us the write did not land. */
  | "not-saved"
  /** The datastore could not be reached, so nothing could be written. */
  | "unavailable"
  /** The server did not say either way. Never reported as success. */
  | "unknown";

/** The shape every current persistence call returns. */
export interface PersistReport {
  persisted?: boolean;
  warning?: string;
}

/**
 * Phrases the server currently uses to mean "the datastore was unreachable",
 * as distinct from "it was reachable and refused the write".
 *
 * TODO(codebuff): this is the one place that guesses, and the only place that
 * needs to change once the contract is fixed. Reading English prose out of
 * `warning` is not a protocol — the server should send a machine-readable
 * discriminator (see the report: decision 1) and this list should then be
 * deleted in favour of reading that field.
 */
const UNAVAILABLE_PHRASES = [
  "temporarily unavailable",
  "unavailable",
  "not configured",
];

/**
 * Classifies what a persistence result actually tells us.
 *
 * Deliberately conservative: anything it cannot place becomes `unknown`
 * rather than `saved`, so a contract change can only ever make the UI vaguer,
 * never make it claim a save that did not happen.
 */
export function classifySave(report: PersistReport | null | undefined): SaveState {
  if (!report) return "unknown";
  if (report.persisted === true) return "saved";
  if (report.persisted === undefined) return "unknown";

  const warning = (report.warning ?? "").toLowerCase();
  if (UNAVAILABLE_PHRASES.some((phrase) => warning.includes(phrase))) {
    return "unavailable";
  }
  return "not-saved";
}

/** True only for the one state that may be presented as a success. */
export function isSaved(state: SaveState): boolean {
  return state === "saved";
}

/* ------------------------------------------------------------- messages --- */

/**
 * Message keys per state, so no surface invents its own wording and RU/UZ
 * stay in step. Headline names the state; hint says what it means for the
 * person reading it.
 */
export const SAVE_STATE_KEY = {
  saved: "save.saved",
  "not-saved": "save.notSaved",
  unavailable: "save.unavailable",
  unknown: "save.unknown",
} as const;

export const SAVE_STATE_HINT_KEY = {
  saved: "save.savedHint",
  "not-saved": "save.notSavedHint",
  unavailable: "save.unavailableHint",
  unknown: "save.unknownHint",
} as const;

/**
 * Tone per state, in majolica terms: turquoise for a real save, saffron when
 * the datastore is simply not there to write to, pomegranate when the server
 * was reachable and the write still failed.
 */
export const SAVE_STATE_TONE: Record<SaveState, string> = {
  saved: "border-brand/45 bg-brand/8 text-brand",
  "not-saved": "border-accent/45 bg-accent/8 text-accent",
  unavailable: "border-saffron/50 bg-saffron/10 text-saffron",
  unknown: "border-hairline bg-surface-sunken text-ink-muted",
};

/** Dot-only tone, for dense rows where a full pill would crowd the line. */
export const SAVE_STATE_DOT: Record<SaveState, string> = {
  saved: "bg-brand",
  "not-saved": "bg-accent",
  unavailable: "bg-saffron",
  unknown: "bg-ink-muted/45",
};
