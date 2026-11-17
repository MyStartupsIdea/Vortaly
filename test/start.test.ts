import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiStatus } from "@/lib/ai/access";
import { resetCreationCooldown, startBusiness } from "@/lib/builder/create";
import { loadSite } from "@/lib/builder/store";
import { ownedSlugs } from "@/lib/owner/store";

// No AI keys in tests: every build falls back to the trade's stock template,
// which is exactly the path a business gets when every provider is down.
const brief = "Салон красоты в Чиланзаре, стрижки и маникюр";
let clock = 1_000_000;
const later = () => (clock += 120_000);

beforeEach(() => resetCreationCooldown());
afterEach(() => vi.unstubAllEnvs());

describe("self-serve start", () => {
  it("creates the business, links the owner and saves a draft", async () => {
    const result = await startBusiness({ name: "Zarnigor", phone: "+998 90 123 45 67", brief, telegramId: 1 }, later());
    expect(result).toEqual({ ok: true, slug: "zarnigor", origin: "template" });

    expect(await ownedSlugs(1)).toEqual(["zarnigor"]);
    const site = await loadSite("zarnigor");
    expect(site.status).toBe("ok");
    if (site.status === "ok") {
      expect(site.site.draft.name).toBe("Zarnigor");
      expect(site.site.draft.phone).toBe("901234567");
      expect(site.site.draft.kind).toBe("salon");
      expect(site.site.published).toBeNull();
    }
  });

  it("a template build does not spend the free AI allowance", async () => {
    expect((await aiStatus("zarnigor"))?.freeUsed).toBe(0);
  });

  it("gives a second business with the same name its own slug", async () => {
    const result = await startBusiness({ name: "Zarnigor", phone: "901234567", brief, telegramId: 2 }, later());
    expect(result).toMatchObject({ ok: true, slug: "zarnigor-2" });
    expect(await ownedSlugs(2)).toEqual(["zarnigor-2"]);
  });

  it("never takes a slug that shadows a page", async () => {
    const result = await startBusiness({ name: "Admin", phone: "901234567", brief, telegramId: 3 }, later());
    expect(result.ok && result.slug).not.toBe("admin");
  });

  it("validates every field before creating anything", async () => {
    expect(await startBusiness({ name: "A", phone: "901234567", brief, telegramId: 4 }, later())).toMatchObject({
      ok: false,
      field: "name",
    });
    expect(await startBusiness({ name: "Okay", phone: "12345", brief, telegramId: 4 }, later())).toMatchObject({
      ok: false,
      field: "phone",
    });
    expect(await startBusiness({ name: "Okay", phone: "901234567", brief: "hi", telegramId: 4 }, later())).toMatchObject({
      ok: false,
      field: "brief",
    });
    expect(await ownedSlugs(4)).toEqual([]);
  });

  it("refuses a second business within a minute", async () => {
    const t0 = later();
    expect((await startBusiness({ name: "Fast One", phone: "901234567", brief, telegramId: 5 }, t0)).ok).toBe(true);
    expect(await startBusiness({ name: "Fast Two", phone: "901234567", brief, telegramId: 5 }, t0 + 10_000)).toEqual({
      ok: false,
      reason: "too_fast",
    });
    expect((await startBusiness({ name: "Fast Two", phone: "901234567", brief, telegramId: 5 }, t0 + 61_000)).ok).toBe(
      true,
    );
  });

  it("stops at the per-owner limit", async () => {
    vi.stubEnv("VORTALY_MAX_BUSINESSES_PER_OWNER", "2");
    expect((await startBusiness({ name: "Limit A", phone: "901234567", brief, telegramId: 6 }, later())).ok).toBe(true);
    expect((await startBusiness({ name: "Limit B", phone: "901234567", brief, telegramId: 6 }, later())).ok).toBe(true);
    expect(await startBusiness({ name: "Limit C", phone: "901234567", brief, telegramId: 6 }, later())).toEqual({
      ok: false,
      reason: "limit_reached",
    });
  });

  it("detects the kind of business from the description", async () => {
    const result = await startBusiness(
      { name: "Kofe Uyi", phone: "901234567", brief: "Небольшая кофейня: кофе, выпечка, завтраки", telegramId: 7 },
      later(),
    );
    expect(result.ok).toBe(true);
    const site = await loadSite(result.ok ? result.slug : "");
    expect(site.status === "ok" && site.site.draft.kind).toBe("cafe");
  });
});
