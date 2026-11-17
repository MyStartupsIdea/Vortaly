import { NextResponse } from "next/server";
import { readOwnerSession } from "@/lib/owner/session";
import { claimInvite } from "@/lib/owner/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/owner/claim   { code }
 *
 * The signed-in owner spends an invite and becomes the owner of its business.
 * The invite is single-use: once claimed, the same link works only for the
 * account that claimed it.
 */
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const owner = readOwnerSession(request);
  if (!owner) return NextResponse.json({ error: "not_signed_in" }, { status: 401, headers });

  let code = "";
  try {
    const body = (await request.json()) as { code?: unknown };
    code = typeof body?.code === "string" ? body.code.trim() : "";
  } catch {
    // Treated as an invalid code below.
  }

  const result = await claimInvite(code, owner.telegramId);
  if (result.ok) return NextResponse.json({ slug: result.slug }, { headers });

  const status = result.reason === "unavailable" ? 503 : result.reason === "invalid" ? 404 : 410;
  return NextResponse.json({ error: `invite_${result.reason}` }, { status, headers });
}
