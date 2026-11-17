import {
  createSalon,
  findSalonBySlug,
  isNetworkError,
  slugFor,
  type FindSalonResult,
} from "@/lib/supabase/salons";
import type { LogLevel, ProjectKind, StageId } from "@/lib/data/projects";
import { recordFreeUse } from "@/lib/ai/access";
import { generateSpec } from "@/lib/builder/generate";
import { cleanPhone } from "@/lib/builder/spec";
import { fileSiteExists, localOnlyMode, saveDraft } from "@/lib/builder/store";
import { ROOT_DOMAIN } from "@/lib/domain/config";
import { adminAuthorized } from "@/lib/domain/admin-auth";

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

export const runtime = "nodejs";
// Site generation is a model round trip with failover across providers.
export const maxDuration = 120;

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
  /** Where the generated site is reviewed, edited and published. */
  builder?: string;
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

const RESERVED_SLUGS = new Set(["admin", "api", "bookings", "builder", "checkout", "chinor"]);

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
  // Same default-closed gate as /api/admin/salons, from one module: the
  // secret in a header for tooling, or the httpOnly session cookie a browser
  // received from POST /api/admin/session.
  if (!adminAuthorized(request)) {
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
           for, and is capped because a log line is not a transcript. The trade
           is inferred from keywords in the browser (lib/console/brief.ts); the
           model is only called later, in buildSite, and is named there. */
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
        // A tenant is served at /<slug>, so it must not shadow a platform route.
        if (RESERVED_SLUGS.has(slug)) slug = `${slug}-app`;
        step("schema", "info", `slug derived: ${slug}`);

        /* Local trial: no Supabase keys at all, outside production. There is no
           tenant table to write to, so the site is built as a local draft and
           the result says so. With keys present this branch is never taken,
           and a database fault is still a hard error below. */
        const local = localOnlyMode();

        let lookup: FindSalonResult = local
          ? {
              found: await fileSiteExists(slug),
              available: true,
              unavailable: false,
            }
          : await findSalonBySlug(slug);

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

            lookup = local
              ? { found: await fileSiteExists(slug), available: true, unavailable: false }
              : await findSalonBySlug(slug);
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

        if (local) {
          step("schema", "warn", "supabase is not configured: local draft only, no tenant row");
          step("domain", "info", `subdomain reserved: ${slug}.${ROOT_DOMAIN}`);
          step("domain", "warn", "dns record and tls certificate: not automated yet");

          const built = await buildSite({ slug, name, phone, kind, brief }, step);
          if (!built) {
            send({ type: "error", status: 503, error: "site draft could not be saved" });
            return;
          }

          send({
            type: "done",
            slug,
            id: slug,
            persisted: false,
            subdomain: `${slug}.${ROOT_DOMAIN}`,
            urls: { tenant: `https://${slug}.${ROOT_DOMAIN}` },
            builder: `/builder/${slug}`,
            warning: "Supabase not configured: the site exists as a local draft only.",
          });
          return;
        }

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
        // The tenant row is real from here on. If the site draft cannot be
        // written the tenant still exists, so this is reported, not thrown:
        // the builder can generate the site later.
        const built = await buildSite({ slug: result.slug, name, phone, kind, brief }, step);

        send({
          type: "done",
          slug: result.slug,
          id: result.id,
          persisted: true,
          subdomain,
          urls: { tenant: `https://${subdomain}` },
          builder: `/builder/${result.slug}`,
          warning: built ? undefined : "Tenant created, but the site draft was not saved.",
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

/**
 * Generates the tenant's site and saves it as a draft, narrating each real
 * step. Returns false only when the draft could not be stored.
 *
 * The log names the model that actually answered, or says plainly that none
 * did and the trade's stock content was used instead. It never claims AI wrote
 * a page that a template produced.
 */
async function buildSite(
  input: { slug: string; name: string; phone: string; kind: string; brief: string },
  step: (stage: StageId, level: LogLevel, text: string) => void,
): Promise<boolean> {
  const kind = input.kind as ProjectKind;
  const phone = cleanPhone(input.phone);

  step("ui", "info", "asking the model for services, prices, texts (ru + uz)...");
  const generated = await generateSpec({
    slug: input.slug,
    name: input.name,
    phone,
    kind,
    // With no brief the trade and the name are all there is to go on.
    brief: input.brief || `${input.name} (${kind})`,
  });

  if (generated.origin === "ai") {
    step("ui", "ok", `site written by ${generated.model}`);
    // The first build is the first free AI action of this site.
    await recordFreeUse(input.slug);
  } else {
    step(
      "ui",
      "warn",
      `ai did not answer (${generated.failure ?? "unavailable"}): stock ${kind} template used`,
    );
  }

  const { spec } = generated;
  const bookable = spec.items.filter((item) => item.bookable).length;
  step(
    "ui",
    "ok",
    `${spec.categories.length} sections, ${spec.items.length} items (${bookable} bookable), ${spec.staff.length} staff`,
  );
  step("ui", "ok", `theme: ${spec.theme}, locales: ru, uz`);

  const saved = await saveDraft(input.slug, spec);
  if (!saved.ok) {
    step(
      "deploy",
      "warn",
      saved.reason === "schema_missing"
        ? "draft not saved: the `sites` table is missing (apply supabase/schema.sql)"
        : `draft not saved: ${saved.reason}`,
    );
    return false;
  }

  if (saved.site.storage === "file") {
    step("deploy", "warn", "draft saved to local files (.vortaly/): the `sites` table is not available");
  } else {
    step("deploy", "ok", "draft saved to supabase");
  }
  step("deploy", "info", `not public yet: review and publish at /builder/${input.slug}`);
  return true;
}

function respondWithError(status: number, error: string) {
  const event: ProvisionError = { type: "error", status, error };
  return new Response(`${JSON.stringify(event)}\n`, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
