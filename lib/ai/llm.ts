import "server-only";

/**
 * One way to ask a model for JSON, across every provider the platform has a key
 * for.
 *
 * All four speak the OpenAI chat-completions dialect, so a provider is a URL, a
 * key name and a default model. A request walks the chain and stops at the
 * first usable answer: a provider that is down, rate-limited or returns
 * something that is not JSON simply hands over to the next one.
 *
 * Deliberate limits:
 *  - One key per provider (`*_API_KEY_1`). The numbered spares are not rotated
 *    through: failing over to a different provider is resilience, cycling keys
 *    on the same provider would be quota evasion.
 *  - Nothing here is returned to a browser. Callers receive a closed error code
 *    and the provider/model that answered, never a key, a status body or a
 *    provider message.
 */

interface Provider {
  id: string;
  url: string;
  keyEnv: string;
  model: string;
}

const PROVIDERS: Provider[] = [
  {
    id: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    keyEnv: "GROQ_API_KEY_1",
    model: "openai/gpt-oss-120b",
  },
  {
    id: "gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    keyEnv: "GEMINI_API_KEY_1",
    model: "gemini-flash-lite-latest",
  },
  {
    id: "openrouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    keyEnv: "OPENROUTER_API_KEY_1",
    model: "openrouter/free",
  },
  {
    id: "orcarouter",
    url: "https://api.orcarouter.ai/v1/chat/completions",
    keyEnv: "ORCAROUTER_API_KEY_1",
    model: "deepseek/deepseek-v4-flash-free",
  },
];

export type AiFailureCode = "not_configured" | "unavailable" | "invalid_response" | "timeout";

export class AiError extends Error {
  readonly code: AiFailureCode;

  constructor(code: AiFailureCode) {
    super(`ai_${code}`);
    this.name = "AiError";
    this.code = code;
  }
}

/**
 * The providers that have a key, in the order they are tried.
 * `VORTALY_MODEL_PROVIDER` moves one to the front, and `VORTALY_MODEL_ID`
 * replaces that provider's default model. The rest stay as fallbacks.
 */
function chain(): Array<Provider & { key: string }> {
  const preferred = process.env.VORTALY_MODEL_PROVIDER?.trim().toLowerCase();
  const preferredModel = process.env.VORTALY_MODEL_ID?.trim();

  const usable: Array<Provider & { key: string }> = [];
  for (const provider of PROVIDERS) {
    const key = process.env[provider.keyEnv]?.trim();
    if (!key) continue;
    const isPreferred = provider.id === preferred;
    const entry = {
      ...provider,
      key,
      model: isPreferred && preferredModel ? preferredModel : provider.model,
    };
    if (isPreferred) usable.unshift(entry);
    else usable.push(entry);
  }
  return usable;
}

export function aiConfigured(): boolean {
  return chain().length > 0;
}

/** Models wrap JSON in prose or fences often enough to plan for it. */
function parseJsonObject(content: string): Record<string, unknown> | null {
  const attempts = [content.trim()];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(content);
  if (fenced) attempts.push(fenced[1].trim());
  const first = content.indexOf("{");
  const last = content.lastIndexOf("}");
  if (first !== -1 && last > first) attempts.push(content.slice(first, last + 1));

  for (const attempt of attempts) {
    try {
      const parsed: unknown = JSON.parse(attempt);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try the next reading of the same answer.
    }
  }
  return null;
}

export interface ChatJsonRequest {
  system: string;
  user: string;
  maxTokens: number;
  /** Per provider attempt, not for the whole chain. */
  timeoutMs: number;
  temperature?: number;
}

export interface ChatJsonResult {
  data: Record<string, unknown>;
  /** "groq/openai/gpt-oss-120b": safe to log and to show an operator. */
  model: string;
}

export async function chatJson(request: ChatJsonRequest): Promise<ChatJsonResult> {
  const providers = chain();
  if (providers.length === 0) throw new AiError("not_configured");

  let lastFailure: AiFailureCode = "unavailable";

  for (const provider of providers) {
    try {
      const response = await fetch(provider.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: provider.model,
          temperature: request.temperature ?? 0.4,
          max_tokens: request.maxTokens,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
        }),
        signal: AbortSignal.timeout(request.timeoutMs),
        cache: "no-store",
      });

      if (!response.ok) {
        // Status only. The body can quote the request and names the account.
        console.warn(`[ai] ${provider.id} answered ${response.status}`);
        lastFailure = "unavailable";
        continue;
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      const data = typeof content === "string" ? parseJsonObject(content) : null;
      if (!data) {
        console.warn(`[ai] ${provider.id} returned no JSON object`);
        lastFailure = "invalid_response";
        continue;
      }

      return { data, model: `${provider.id}/${provider.model}` };
    } catch (error) {
      const timedOut =
        error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      console.warn(`[ai] ${provider.id} ${timedOut ? "timed out" : "request failed"}`);
      lastFailure = timedOut ? "timeout" : "unavailable";
    }
  }

  throw new AiError(lastFailure);
}
