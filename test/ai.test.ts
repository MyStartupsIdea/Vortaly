import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { aiStatus, recordFreeUse, removeOwnKey, resolveAccess, storeOwnKey } from "@/lib/ai/access";
import { AiError, chatJson, checkOwnKey } from "@/lib/ai/llm";

const KEY = "AIzaSy-test-key-0123456789abcdef";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("free allowance", () => {
  it("counts down and then asks for a key", async () => {
    vi.stubEnv("VORTALY_FREE_AI_ACTIONS", "2");
    expect(await resolveAccess("quota")).toEqual({ mode: "free", freeLeft: 2 });
    await recordFreeUse("quota");
    expect(await resolveAccess("quota")).toEqual({ mode: "free", freeLeft: 1 });
    await recordFreeUse("quota");
    expect(await resolveAccess("quota")).toEqual({ mode: "key_required" });
  });

  it("defaults to five free actions", async () => {
    expect((await aiStatus("fresh"))?.freeLimit).toBe(5);
  });
});

describe("own key", () => {
  it("is stored encrypted and used instead of the allowance", async () => {
    vi.stubEnv("VORTALY_FREE_AI_ACTIONS", "0");
    expect(await storeOwnKey("keyed", { provider: "gemini", key: KEY })).toBe("ok");

    const raw = await readFile(path.join(process.cwd(), ".vortaly", "ai", "keyed.json"), "utf8");
    expect(raw).not.toContain(KEY);

    expect(await resolveAccess("keyed")).toEqual({ mode: "own", ownKey: { provider: "gemini", key: KEY } });
    const status = await aiStatus("keyed");
    expect(status?.ownKey).toMatchObject({ provider: "gemini", hint: KEY.slice(-4) });
    expect(JSON.stringify(status)).not.toContain(KEY);
  });

  it("is forgotten when the encryption secret changes", async () => {
    vi.stubEnv("VORTALY_FREE_AI_ACTIONS", "0");
    await storeOwnKey("rotated", { provider: "groq", key: KEY });
    vi.stubEnv("VORTALY_KEY_SECRET", "a-different-secret");
    expect(await resolveAccess("rotated")).toEqual({ mode: "key_required" });
  });

  it("can be removed", async () => {
    vi.stubEnv("VORTALY_FREE_AI_ACTIONS", "0");
    await storeOwnKey("removed", { provider: "groq", key: KEY });
    await removeOwnKey("removed");
    expect(await resolveAccess("removed")).toEqual({ mode: "key_required" });
  });

  it("cannot be stored in production without a secret", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VORTALY_KEY_SECRET", "");
    expect(await storeOwnKey("prod", { provider: "groq", key: KEY })).toBe("disabled");
  });
});

describe("chatJson with an own key", () => {
  it("calls only the owner's provider, never the platform's", async () => {
    vi.stubEnv("GROQ_API_KEY_1", "platform-key");
    const fetch = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetch);

    const result = await chatJson({
      system: "s",
      user: "u",
      maxTokens: 10,
      timeoutMs: 1000,
      ownKey: { provider: "gemini", key: KEY },
    });
    expect(result.data).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("generativelanguage.googleapis.com");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
  });

  it("reports a refused own key as key_rejected", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 401 })));
    const call = chatJson({ system: "s", user: "u", maxTokens: 10, timeoutMs: 1000, ownKey: { provider: "groq", key: KEY } });
    await expect(call).rejects.toMatchObject({ code: "key_rejected" });
    await expect(call).rejects.toBeInstanceOf(AiError);
  });

  it("finds JSON inside a fenced answer", async () => {
    vi.stubEnv("GROQ_API_KEY_1", "platform-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: 'Here:\n```json\n{"a":1}\n```' } }] }), {
          status: 200,
        }),
      ),
    );
    expect((await chatJson({ system: "s", user: "u", maxTokens: 10, timeoutMs: 1000 })).data).toEqual({ a: 1 });
  });

  it("with no platform keys at all, says not_configured", async () => {
    await expect(chatJson({ system: "s", user: "u", maxTokens: 10, timeoutMs: 1000 })).rejects.toMatchObject({
      code: "not_configured",
    });
  });
});

describe("checkOwnKey", () => {
  it("maps provider answers to ok / rejected / unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    expect(await checkOwnKey({ provider: "groq", key: KEY })).toBe("ok");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    expect(await checkOwnKey({ provider: "groq", key: KEY })).toBe("rejected");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    expect(await checkOwnKey({ provider: "groq", key: KEY })).toBe("unreachable");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await checkOwnKey({ provider: "groq", key: KEY })).toBe("unreachable");
  });
});
