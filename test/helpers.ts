import { createHash, createHmac } from "node:crypto";

export const BOT_TOKEN = "123456:test-token";

/** A Telegram Login Widget payload signed the way Telegram signs it. */
export function signWidget(fields: Record<string, string | number>, token = BOT_TOKEN) {
  const secret = createHash("sha256").update(token).digest();
  const check = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("\n");
  return { ...fields, hash: createHmac("sha256", secret).update(check).digest("hex") };
}

/** Mini App initData signed the way Telegram signs it. */
export function signInitData(fields: Record<string, string>, token = BOT_TOKEN): string {
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const check = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("\n");
  const hash = createHmac("sha256", secret).update(check).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

export const nowSeconds = () => Math.floor(Date.now() / 1000);

export function requestWithCookie(url: string, cookie?: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  return new Request(url, { ...init, headers });
}
