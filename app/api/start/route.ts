import { NextResponse } from "next/server";
import { startBusiness } from "@/lib/builder/create";
import { readOwnerSession } from "@/lib/owner/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The AI writes the first draft inside this request.
export const maxDuration = 120;

/**
 * POST /api/start   { name, phone, brief }
 *
 * A business owner, signed in with Telegram, creates their own business and
 * gets its first AI-written draft (lib/builder/create.ts). The owner comes
 * from the session, never from the body.
 *
 * 200 { slug, origin } · 400 invalid field · 401 not signed in ·
 * 409 business limit reached · 429 too fast · 503 storage unavailable.
 */
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const owner = readOwnerSession(request);
  if (!owner) return NextResponse.json({ error: "not_signed_in" }, { status: 401, headers });

  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await request.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  } catch {
    // Every field is then missing, which is answered below.
  }
  const text = (value: unknown) => (typeof value === "string" ? value : "");

  const result = await startBusiness({
    name: text(body.name),
    phone: text(body.phone),
    brief: text(body.brief),
    telegramId: owner.telegramId,
  });

  if (result.ok) return NextResponse.json({ slug: result.slug, origin: result.origin }, { headers });

  const status = { invalid: 400, limit_reached: 409, too_fast: 429, unavailable: 503 }[result.reason];
  return NextResponse.json({ error: result.reason, field: result.field }, { status, headers });
}
