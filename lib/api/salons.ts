import type { ProvisionEvent } from "@/app/api/admin/provision/route";
import type { SalonRecord } from "@/lib/supabase/salons";

/**
 * Browser-side client for the platform-admin endpoints. Types are imported,
 * never the modules themselves, so no server code reaches the bundle.
 */

export type { SalonRecord, ProvisionEvent };

export interface ListSalonsResult {
  salons: SalonRecord[];
  /** Present when the server could answer but had nothing to read from. */
  warning?: string;
}

export async function listSalons(): Promise<ListSalonsResult> {
  const response = await fetch("/api/admin/salons", { cache: "no-store" });
  if (!response.ok) {
    return { salons: [], warning: `GET /api/admin/salons -> ${response.status}` };
  }
  return (await response.json()) as ListSalonsResult;
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
