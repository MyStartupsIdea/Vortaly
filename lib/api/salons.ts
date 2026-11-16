import type { ProvisionEvent } from "@/app/api/admin/provision/route";
import type { SalonRecord } from "@/lib/supabase/salons";

/**
 * Browser-side client for the platform-admin endpoints. Types are imported,
 * never the modules themselves, so no server code reaches the bundle.
 *
 * None of these functions knows the platform-admin secret, and none of them
 * can: it is a server-only value. The browser is authorised by the httpOnly
 * cookie that `unlockAdmin` asks the server to set, which this code can send
 * (the browser attaches it automatically) but never read.
 */

export type { SalonRecord, ProvisionEvent };

export interface ListSalonsResult {
  salons: SalonRecord[];
  /** Present when the server could answer but had nothing to read from. */
  warning?: string;
  /**
   * True when the admin API refused the request. It is deliberately distinct
   * from "the list is empty": an empty list is a fact about the platform, a
   * refusal is a fact about this browser's credentials, and the console must
   * not present one as the other.
   */
  unauthorized?: boolean;
}

export async function listSalons(): Promise<ListSalonsResult> {
  const response = await fetch("/api/admin/salons", { cache: "no-store" });

  if (response.status === 401) {
    return { salons: [], unauthorized: true, warning: "GET /api/admin/salons -> 401" };
  }

  if (!response.ok) {
    return { salons: [], warning: `GET /api/admin/salons -> ${response.status}` };
  }

  const body = (await response.json()) as ListSalonsResult;
  return body;
}

// --------------------------------------------------------- admin session ----

export interface AdminAuthState {
  /** Whether the deployment has a platform-admin secret configured at all. */
  configured: boolean;
  /** Whether this browser currently holds a valid admin session. */
  authorized: boolean;
}

/** Reads whether this browser is unlocked, without presenting a credential. */
export async function adminAuthState(): Promise<AdminAuthState> {
  try {
    const response = await fetch("/api/admin/session", { cache: "no-store" });
    if (!response.ok) return { configured: false, authorized: false };
    return (await response.json()) as AdminAuthState;
  } catch {
    return { configured: false, authorized: false };
  }
}

export type UnlockResult =
  /** The secret was accepted; the session cookie is now set. */
  | { ok: true }
  /** The secret was refused. */
  | { ok: false; reason: "denied" }
  /** The server has no PLATFORM_ADMIN_SECRET, so no secret can be right. */
  | { ok: false; reason: "not_configured" }
  /** Too many failed attempts from this address. */
  | { ok: false; reason: "throttled" }
  /** The request itself failed. */
  | { ok: false; reason: "unreachable" };

/**
 * Sends the secret to the server once, in a POST body, in exchange for an
 * httpOnly session cookie. The value is not stored anywhere on the client:
 * the caller holds it only for the lifetime of the submitted form field.
 */
export async function unlockAdmin(secret: string): Promise<UnlockResult> {
  let response: Response;
  try {
    response = await fetch("/api/admin/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret }),
    });
  } catch {
    return { ok: false, reason: "unreachable" };
  }

  if (response.ok) return { ok: true };
  if (response.status === 503) return { ok: false, reason: "not_configured" };
  if (response.status === 429) return { ok: false, reason: "throttled" };
  if (response.status === 401) return { ok: false, reason: "denied" };
  return { ok: false, reason: "unreachable" };
}

/** Drops the admin session cookie. */
export async function lockAdmin(): Promise<void> {
  try {
    await fetch("/api/admin/session", { method: "DELETE" });
  } catch {
    // Nothing to recover: the cookie expires on its own.
  }
}

export interface ProvisionInput {
  name: string;
  /** Digits only, without the +998 country code. */
  phoneNational: string;
  kind: string;
  /** The operator's prompt, logged by the server as the build brief. */
  brief?: string;
  taglineRu?: string;
  taglineUz?: string;
}

/**
 * Creates a tenant and reports every real step as it happens.
 *
 * `onEvent` fires per line of the NDJSON stream, so the caller can render
 * progress while the server is still working.
 */
export async function provisionSalon(
  input: ProvisionInput,
  onEvent: (event: ProvisionEvent) => void,
): Promise<void> {
  const response = await fetch("/api/admin/provision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      phone: `+998${input.phoneNational}`,
      kind: input.kind,
      brief: input.brief,
      taglineRu: input.taglineRu,
      taglineUz: input.taglineUz,
    }),
  });

  if (!response.body) {
    onEvent({
      type: "error",
      status: response.status,
      error: `POST /api/admin/provision -> ${response.status}, empty body`,
    });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Chunk boundaries fall anywhere, so events are parsed per newline and the
  // trailing partial line is carried over.
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });

    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) emit(line, onEvent);
      newline = buffer.indexOf("\n");
    }

    if (done) break;
  }

  const rest = buffer.trim();
  if (rest) emit(rest, onEvent);
}

function emit(line: string, onEvent: (event: ProvisionEvent) => void): void {
  try {
    onEvent(JSON.parse(line) as ProvisionEvent);
  } catch {
    onEvent({ type: "error", status: 500, error: `unparsable event: ${line.slice(0, 120)}` });
  }
}
