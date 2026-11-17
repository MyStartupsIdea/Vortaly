import { describe, expect, it } from "vitest";
import { issueAdminSession, ADMIN_SESSION_COOKIE } from "@/lib/domain/admin-auth";
import { guard } from "@/lib/builder/http";
import { issueOwnerSession, OWNER_SESSION_COOKIE, readOwnerSession } from "@/lib/owner/session";
import { claimInvite, createInvite, ownedSlugs, ownersOf } from "@/lib/owner/store";
import { requestWithCookie } from "./helpers";

const ownerCookie = (telegramId: number, now?: number) =>
  `${OWNER_SESSION_COOKIE}=${issueOwnerSession({ telegramId, name: "Test" }, now)}`;

describe("owner session", () => {
  it("round-trips the Telegram id through a signed cookie", () => {
    const session = readOwnerSession(requestWithCookie("http://x/", ownerCookie(111)));
    expect(session).toEqual({ telegramId: 111, name: "Test" });
  });

  it("rejects a cookie whose payload was edited", () => {
    const token = issueOwnerSession({ telegramId: 111, name: "Test" })!;
    const [version, body, signature] = token.split(".");
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    const forged = Buffer.from(JSON.stringify({ ...data, id: 999 })).toString("base64url");
    const request = requestWithCookie("http://x/", `${OWNER_SESSION_COOKIE}=${version}.${forged}.${signature}`);
    expect(readOwnerSession(request)).toBeNull();
  });

  it("rejects an expired session", () => {
    const longAgo = Date.now() - 31 * 24 * 3600 * 1000;
    expect(readOwnerSession(requestWithCookie("http://x/", ownerCookie(111, longAgo)))).toBeNull();
  });

  it("returns null without a cookie", () => {
    expect(readOwnerSession(new Request("http://x/"))).toBeNull();
  });
});

describe("invites", () => {
  it("link exactly one account, once", async () => {
    const invite = await createInvite("alpha");
    expect(invite).not.toBeNull();

    expect(await claimInvite(invite!.code, 111)).toEqual({ ok: true, slug: "alpha" });
    // The same owner opening their link again is harmless.
    expect(await claimInvite(invite!.code, 111)).toEqual({ ok: true, slug: "alpha" });
    // Anyone else holding a forwarded copy gets nothing.
    expect(await claimInvite(invite!.code, 222)).toEqual({ ok: false, reason: "used" });

    expect(await ownedSlugs(111)).toEqual(["alpha"]);
    expect(await ownedSlugs(222)).toEqual([]);
    expect(await ownersOf("alpha")).toEqual([111]);
  });

  it("reject unknown and malformed codes", async () => {
    expect(await claimInvite("A".repeat(24), 111)).toEqual({ ok: false, reason: "invalid" });
    expect(await claimInvite("../../etc", 111)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("builder gate", () => {
  const params = (slug: string) => Promise.resolve({ slug });

  it("lets the operator into any business", async () => {
    const cookie = `${ADMIN_SESSION_COOKIE}=${issueAdminSession()}`;
    const result = await guard(requestWithCookie("http://x/", cookie), params("anything"));
    expect(result).toEqual({ slug: "anything", viewer: "admin" });
  });

  it("lets an owner into their own business only", async () => {
    const invite = await createInvite("bravo");
    await claimInvite(invite!.code, 333);

    const own = await guard(requestWithCookie("http://x/", ownerCookie(333)), params("bravo"));
    expect(own).toEqual({ slug: "bravo", viewer: "owner" });

    const other = await guard(requestWithCookie("http://x/", ownerCookie(333)), params("alpha"));
    expect("response" in other && other.response.status).toBe(401);
  });

  it("refuses a stranger and a bad slug", async () => {
    const stranger = await guard(new Request("http://x/"), params("bravo"));
    expect("response" in stranger && stranger.response.status).toBe(401);

    const badSlug = await guard(new Request("http://x/"), params("../etc"));
    expect("response" in badSlug && badSlug.response.status).toBe(400);
  });
});
