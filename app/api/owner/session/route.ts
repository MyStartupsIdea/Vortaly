import { NextResponse } from "next/server";
import { loadSite } from "@/lib/builder/store";
import {
  issueOwnerSession,
  ownerCookie,
  ownerSessionsEnabled,
  OWNER_SESSION_TTL_SECONDS,
  readOwnerSession,
  type OwnerSession,
} from "@/lib/owner/session";
import { ownedSlugs } from "@/lib/owner/store";
import { verifyInitData } from "@/lib/telegram/init-data";
import { verifyLoginWidget } from "@/lib/telegram/login-widget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/owner/session — a business owner signs in with Telegram.
 *
 *   GET     who is signed in, and the businesses they can open
 *   POST    { widget: <Telegram Login Widget payload> }   on the web
 *           { initData: <Telegram.WebApp.initData> }      inside Telegram
 *   DELETE  sign out
 *
 * Both POST forms are verified with the bot token on the server; the browser's
 * idea of who it is counts for nothing. Signing in does not grant any business
 * by itself: access comes only from an invite (POST /api/owner/claim).
 */

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

async function describe(owner: OwnerSession) {
  const slugs = await ownedSlugs(owner.telegramId);
  if (!slugs) return null;
  const sites = await Promise.all(
    slugs.map(async (slug) => {
      const site = await loadSite(slug);
      return {
        slug,
        name: site.status === "ok" ? site.site.draft.name : slug,
        published: site.status === "ok" && site.site.published !== null,
      };
    }),
  );
  return { owner: { name: owner.name }, sites };
}

export async function GET(request: Request) {
  const owner = readOwnerSession(request);
  if (!owner) return json({ owner: null, sites: [] });
  const described = await describe(owner);
  if (!described) return json({ error: "storage_unavailable" }, 503);
  return json(described);
}

export async function POST(request: Request) {
  if (!ownerSessionsEnabled()) return json({ error: "owner_login_disabled" }, 503);

  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = await request.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    // Answered below.
  }
  if (!body) return json({ error: "invalid_body" }, 400);

  let owner: OwnerSession;
  if (typeof body.initData === "string") {
    const verified = verifyInitData(body.initData);
    if (!verified.ok) {
      return json({ error: verified.reason === "not_configured" ? "telegram_not_configured" : "login_invalid" }, verified.reason === "not_configured" ? 503 : 401);
    }
    owner = { telegramId: verified.user.id, name: verified.user.firstName ?? verified.user.username ?? "" };
  } else if (body.widget !== undefined) {
    const verified = verifyLoginWidget(body.widget);
    if (!verified.ok) {
      return json({ error: verified.reason === "not_configured" ? "telegram_not_configured" : "login_invalid" }, verified.reason === "not_configured" ? 503 : 401);
    }
    owner = { telegramId: verified.user.id, name: verified.user.firstName ?? verified.user.username ?? "" };
  } else {
    return json({ error: "invalid_body" }, 400);
  }

  const token = issueOwnerSession(owner);
  if (!token) return json({ error: "owner_login_disabled" }, 503);

  const described = await describe(owner);
  const response = json(described ?? { owner: { name: owner.name }, sites: [] });
  response.cookies.set(ownerCookie(token, OWNER_SESSION_TTL_SECONDS));
  return response;
}

export async function DELETE() {
  const response = json({ owner: null, sites: [] });
  response.cookies.set(ownerCookie("", 0));
  return response;
}
