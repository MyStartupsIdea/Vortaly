import { describe, expect, it } from "vitest";
import { verifyInitData } from "@/lib/telegram/init-data";
import { verifyLoginWidget } from "@/lib/telegram/login-widget";
import { nowSeconds, signInitData, signWidget } from "./helpers";

describe("verifyLoginWidget", () => {
  it("accepts a payload signed with the bot token", () => {
    const result = verifyLoginWidget(signWidget({ id: 111, first_name: "Dilnoza", auth_date: nowSeconds() }));
    expect(result).toEqual({ ok: true, user: { id: 111, firstName: "Dilnoza", username: undefined } });
  });

  it("rejects a payload whose id was changed after signing", () => {
    const signed = signWidget({ id: 111, first_name: "Dilnoza", auth_date: nowSeconds() });
    expect(verifyLoginWidget({ ...signed, id: 999 })).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects a payload signed by another bot", () => {
    const signed = signWidget({ id: 111, auth_date: nowSeconds() }, "999:other-bot");
    expect(verifyLoginWidget(signed)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects a Mini App style signature (different key derivation)", () => {
    const initData = new URLSearchParams(signInitData({ id: "111", auth_date: String(nowSeconds()) }));
    const asWidget = Object.fromEntries(initData.entries());
    expect(verifyLoginWidget(asWidget).ok).toBe(false);
  });

  it("rejects an old login", () => {
    const signed = signWidget({ id: 111, auth_date: nowSeconds() - 2 * 24 * 3600 });
    expect(verifyLoginWidget(signed)).toEqual({ ok: false, reason: "expired" });
  });

  it("ignores extra fields a client adds, instead of signing them", () => {
    const signed = signWidget({ id: 111, auth_date: nowSeconds() });
    expect(verifyLoginWidget({ ...signed, role: "admin" }).ok).toBe(true);
  });

  it("rejects junk", () => {
    expect(verifyLoginWidget(null).ok).toBe(false);
    expect(verifyLoginWidget("x").ok).toBe(false);
    expect(verifyLoginWidget({ hash: "zz" }).ok).toBe(false);
  });
});

describe("verifyInitData", () => {
  const user = JSON.stringify({ id: 222, first_name: "Aziz" });

  it("accepts initData signed for this bot", () => {
    const result = verifyInitData(signInitData({ user, auth_date: String(nowSeconds()) }));
    expect(result.ok && result.user.id).toBe(222);
  });

  it("rejects a tampered user", () => {
    const good = new URLSearchParams(signInitData({ user, auth_date: String(nowSeconds()) }));
    good.set("user", JSON.stringify({ id: 1, first_name: "Aziz" }));
    expect(verifyInitData(good.toString())).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects expired initData", () => {
    const old = signInitData({ user, auth_date: String(nowSeconds() - 3 * 24 * 3600) });
    expect(verifyInitData(old)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a Login Widget style signature", () => {
    const widget = signWidget({ id: 222, auth_date: nowSeconds() });
    const asInitData = new URLSearchParams(Object.entries(widget).map(([k, v]) => [k, String(v)])).toString();
    expect(verifyInitData(asInitData).ok).toBe(false);
  });
});
