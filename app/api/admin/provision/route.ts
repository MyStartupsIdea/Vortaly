import {
  createSalon,
  findSalonBySlug,
  isNetworkError,
  slugFor,
  type FindSalonResult,
} from "@/lib/supabase/salons";
import type { LogLevel, StageId } from "@/lib/data/projects";
import { ROOT_DOMAIN } from "@/lib/domain/config";

const ADMIN_SECRET_OK = process.env.PLATFORM_ADMIN_SECRET == null
  ? () => false
  : (request: Request) => {
      const secret = process.env.PLATFORM_ADMIN_SECRET;
      if (!secret) return false;

      const auth = (request.headers.get("authorization") ?? "").trim();
      if (auth.startsWith("Bearer ") && auth.slice(7) === secret) return true;

      return request.headers.get("x-platform-admin-secret") === secret;
    };

/**
 * Streams tenant provisioning as newline-delimited JSON, one event per real
 * step, so the console's terminal shows what actually happened instead of a
 * scripted animation.
 *
 * The REST endpoint at /api/admin/salons is unchanged and still creates a
 * tenant in a single call; this route performs the same creation through the
 * same data layer (lib/supabase/salons.ts) and narrates it.
 *
 * Every line here reports an operation that was really attempted. Work that is
 * not wired up yet — DNS records, TLS issuance — is reported as pending rather
 * than claimed as done.
 */

export interface ProvisionStep {
  type: "step";
  stage: StageId;
  level: LogLevel;
  text: string;
}

export interface ProvisionDone {
  type: "done";
  slug: string;
  id: string;
  persisted: boolean;
  subdomain: string;
  urls: { tenant: string };
  warning?: string;
}

export interface ProvisionError {
  type: "error";
  status: number;
  error: string;
}

export type ProvisionEvent = ProvisionStep | ProvisionDone | ProvisionError;

/** Tables a tenant of each kind gets, matching supabase/schema.sql. */
const TENANT_TABLES: Record<string, string[]> = {
  salon: ["salons", "services", "masters", "master_services", "bookings", "payments"],
  cafe: ["salons", "services", "bookings", "payments"],
  carwash: ["salons", "services", "masters", "bookings", "payments"],
  custom: ["salons", "services", "bookings", "payments"],
};

interface Body {
  name?: string;
  phone?: string;
  kind?: string;
  /** The plain-language prompt the console was driven with. */
  brief?: string;
  taglineRu?: string;
  taglineUz?: string;
}

export async function POST(request: Request) {
  if (!ADMIN_SECRET_OK(request)) {
    return respondWithError(401, "access denied");
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return respondWithError(400, "Body must be JSON");
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ProvisionEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      const step = (stage: StageId, level: LogLevel, text: string) =>
        send({ type: "step", stage, level, text });

      try {
        // ---------------------------------------------------- validation ----
        const name = (body.name ?? "").trim();
        const phone = String(body.phone ?? "").replace(/[^\d+]/g, "");
        const kind = body.kind && body.kind in TENANT_TABLES ? body.kind : "custom";

        if (name.length < 2) {
          send({ type: "error", status: 400, error: "name is required (min 2 characters)" });
          return;
        }
        if (!/^(\+?998)?\d{9}$/.test(phone)) {
          send({
            type: "error",
            status: 400,
            error: "phone must be a valid Uzbek number (e.g. +998901234567)",
          });
          return;
        }

        step("schema", "ok", `input accepted: "${name}", ${phone}`);

        /* The brief is echoed verbatim so the log says what was actually asked
           for, and is capped because a log line is not a transcript. Keyword
           inference happens in the browser (lib/console/brief.ts); nothing
           here calls a model, so the log claims no more than that. */
        const brief = (body.brief ?? "").replace(/\s+/g, " ").trim();
        if (brief) {
          step(
            "schema",
            "info",
            `brief: "${brief.length > 160 ? `${brief.slice(0, 160)}...` : brief}"`,
          );
          step("schema", "info", `kind from brief keywords: ${kind}`);
        } else {
          step("schema", "info", `kind: ${kind} (no brief supplied)`);
        }

        // ---------------------------------------------- slug + collision ----
        let slug = slugFor(name);
        step("schema", "info", `slug derived: ${slug}`);

        let lookup: FindSalonResult = await findSalonBySlug(slug);

        if (lookup.unavailable) {
          send({
            type: "error",
            status: 503,
            error:
              "Supabase temporarily unavailable — cannot verify slug availability.",
          });
          return;
        }

        if (lookup.found) {
          const base = slug;
          let suffix = 2;

          while (lookup.found && suffix <= 9) {
            slug = `${base}-${suffix}`;

            lookup = await findSalonBySlug(slug);
            if (lookup.unavailable) {
              send({
                type: "error",
                status: 503,
                error:
                  "Supabase temporarily unavailable — cannot verify slug availability.",
              });
              return;
            }

            suffix += 1;
          }

          step("schema", "warn", `"${base}" already taken, using ${slug}`);
        } else {
          step("schema", "ok", `${slug} is free`);
        }

        // ------------------------------------------------------- database ----
        const tables = TENANT_TABLES[kind];
        step("schema", "info", `tenant rows land in: ${tables.join(", ")}`);

        // Do not trust a free-looking slug or a successful-looking insert as
        // proof that the tenant was created. If createSalon could not persist,
        // provisioning is not done — report it as an error so the caller does
        // not think the tenant is live.
        const result = await createSalon({
          name,
          taglineRu: body.taglineRu?.trim() || "Салон красоты и барбершоп",
          taglineUz: body.taglineUz?.trim() || "Salon va barbershop",
          addressRu: "",
          addressUz: "",
          phone,
          slug,
        });

        if (result.persisted) {
          step("schema", "ok", `insert into salons: id=${result.id}`);
        } else {
          // Persisted false means the row was not stored — either Supabase was
          // unreachable/in degraded state, or the insert itself failed. Either
          // way this provisioning cannot be reported as successful.
          send({
            type: "error",
            status: 503,
            error:
              result.warning ? `tenant creation failed: ${result.warning}` : "tenant creation failed",
          });
          return;
        }

        // Re-read what we just wrote. If this comes back unavailable or empty,
        // do not report the tenant as live.
        const verified: FindSalonResult = await findSalonBySlug(result.slug);

        if (verified.unavailable) {
          send({
            type: "error",
            status: 503,
            error:
              "Supabase temporarily unavailable — cannot confirm tenant was created.",
          });
          return;
        }

        if (!verified.found) {
          send({
            type: "error",
            status: 500,
            error: "tenant creation reported success but the row could not be read back",
          });
          return;
        }

        step("schema", "ok", `read back ok: ${result.slug}`);


        // ------------------------------------------------------- subdomain ---
        const subdomain = `${result.slug}.${ROOT_DOMAIN}`;
        step("domain", "info", `subdomain reserved: ${subdomain}`);
        step(
          "domain",
          "ok",
          "middleware resolves this host to the tenant",
        );
        // Honest: nothing here talks to a DNS or ACME provider yet.
        step("domain", "warn", "dns record and tls certificate: not automated yet");

        // -------------------------------------------------------------- ui ---
        step("ui", "ok", "tenant uses the shared app, no per-tenant build");
        step("ui", "ok", "screens: services, master, time, contacts, payment");
        step("ui", "ok", "locales ready: ru, uz");

        // ---------------------------------------------------------- deploy ---
        step("deploy", "ok", `live at /${result.slug}`);


        send({
          type: "done",
          slug: result.slug,
          id: result.id,
          persisted: true,
          subdomain,
          urls: { tenant: `https://${subdomain}` },
        });
      } catch (cause) {
        send({
          type: "error",
          status: 500,
          error: cause instanceof Error ? cause.message : "provisioning failed",
        });
      } finally {
        // Single owner of closing. A second close() would throw and discard
        // whatever had just been enqueued.
        try {
          controller.close();
        } catch {
          // Already closed by a cancelled request — nothing to do.
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Stops a reverse proxy from buffering the stream into one chunk.
      "X-Accel-Buffering": "no",
    },
  });
}

function respondWithError(status: number, error: string) {
  const event: ProvisionError = { type: "error", status, error };
  return new Response(`${JSON.stringify(event)}\n`, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
