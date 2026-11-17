/**
 * Browser-side client for /api/owner/session and /api/owner/claim. The session
 * itself is an httpOnly cookie: this code never sees or stores a credential.
 */

export interface OwnerView {
  owner: { name: string } | null;
  sites: Array<{ slug: string; name: string }>;
}

export type LoginFailure = "invalid" | "not_configured" | "disabled" | "error";
export type ClaimFailure = "invalid" | "expired" | "used" | "not_signed_in" | "error";

async function body(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function fetchOwner(): Promise<OwnerView | null> {
  try {
    const response = await fetch("/api/owner/session", { cache: "no-store" });
    return response.ok ? ((await body(response)) as unknown as OwnerView) : null;
  } catch {
    return null;
  }
}

export async function signIn(
  credential: { widget: unknown } | { initData: string },
): Promise<{ ok: true; view: OwnerView } | { ok: false; reason: LoginFailure }> {
  try {
    const response = await fetch("/api/owner/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credential),
    });
    const data = await body(response);
    if (response.ok) return { ok: true, view: data as unknown as OwnerView };
    if (data.error === "login_invalid") return { ok: false, reason: "invalid" };
    if (data.error === "telegram_not_configured") return { ok: false, reason: "not_configured" };
    if (data.error === "owner_login_disabled") return { ok: false, reason: "disabled" };
    return { ok: false, reason: "error" };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export async function signOut(): Promise<void> {
  try {
    await fetch("/api/owner/session", { method: "DELETE" });
  } catch {
    // The cookie expires on its own; the page resets either way.
  }
}

export async function claim(
  code: string,
): Promise<{ ok: true; slug: string } | { ok: false; reason: ClaimFailure }> {
  try {
    const response = await fetch("/api/owner/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await body(response);
    if (response.ok && typeof data.slug === "string") return { ok: true, slug: data.slug };
    if (response.status === 401) return { ok: false, reason: "not_signed_in" };
    const known: Record<string, ClaimFailure> = {
      invite_invalid: "invalid",
      invite_expired: "expired",
      invite_used: "used",
    };
    return { ok: false, reason: known[String(data.error)] ?? "error" };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Operator only: a one-time link that makes its opener this business's owner. */
export async function createOwnerInvite(
  slug: string,
): Promise<{ ok: true; url: string; expiresAt: string } | { ok: false }> {
  try {
    const response = await fetch(`/api/builder/${slug}/invite`, { method: "POST" });
    const data = await body(response);
    if (response.ok && typeof data.url === "string") {
      return { ok: true, url: data.url, expiresAt: String(data.expiresAt ?? "") };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}
