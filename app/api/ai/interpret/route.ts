import { NextResponse } from "next/server";
import { AiInterpretError, interpretBrief } from "@/lib/ai/interpret-brief";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_BRIEF = 8;
const MAX_BRIEF = 500;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const brief =
    typeof body === "object" && body !== null && "brief" in body
      ? (body as { brief?: unknown }).brief
      : undefined;

  if (typeof brief !== "string" || brief.trim().length < MIN_BRIEF || brief.length > MAX_BRIEF) {
    return NextResponse.json(
      { error: `Brief must be between ${MIN_BRIEF} and ${MAX_BRIEF} characters` },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await interpretBrief(brief.trim()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    // Provider status, body and message stay server-side. The client only learns
    // that interpretation is unavailable, and falls back to its local parser.
    const code = error instanceof AiInterpretError ? error.code : "unexpected";
    console.warn("[ai/interpret] failed:", code);
    return NextResponse.json(
      { error: "AI interpretation is unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
