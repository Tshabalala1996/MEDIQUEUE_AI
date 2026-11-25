/**
 * Thin client for OpenRouter's OpenAI-compatible chat completions API.
 *
 * https://openrouter.ai/docs — this never throws: every failure mode (missing
 * key, network error, timeout, bad response) comes back as `{ ok: false }` so
 * callers — especially the emergency symptom check — can fail safe instead of
 * crashing a request or silently pretending nothing is wrong.
 */

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemini-2.5-flash-lite';
const TIMEOUT_MS = 12_000;

export function isOpenRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export function getModel(): string {
  return process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface ChatJsonResult {
  ok: boolean;
  /** Parsed JSON body of the model's reply, when `ok`. */
  data: unknown;
  model: string;
  latencyMs: number;
  /** Present when `ok` is false — never PHI, safe to log. */
  error?: string;
}

/**
 * Sends a chat completion request and parses the reply as JSON.
 * Requests `response_format: json_object`, and — since not every model
 * honours that reliably — also falls back to extracting the first `{...}`
 * block from the raw text if strict parsing fails.
 */
export async function chatJSON(messages: ChatMessage[], opts: { maxTokens?: number; temperature?: number } = {}): Promise<ChatJsonResult> {
  const t0 = performance.now();
  const model = getModel();

  if (!isOpenRouterConfigured()) {
    return { ok: false, data: null, model, latencyMs: 0, error: 'OpenRouter is not configured (OPENROUTER_API_KEY missing)' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        // Optional but recommended by OpenRouter for attribution/rate-limit fairness.
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'MediQueue AI',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.1,
        max_tokens: opts.maxTokens ?? 500,
        response_format: { type: 'json_object' },
      }),
    });

    const latencyMs = Math.round(performance.now() - t0);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, data: null, model, latencyMs, error: `OpenRouter HTTP ${res.status}: ${text.slice(0, 300)}` };
    }

    const body = await res.json().catch(() => null);
    const content: unknown = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return { ok: false, data: null, model, latencyMs, error: 'OpenRouter response had no message content' };
    }

    const parsed = parseJsonLoose(content);
    if (parsed === undefined) {
      return { ok: false, data: null, model, latencyMs, error: 'Could not parse a JSON object from the model response' };
    }

    return { ok: true, data: parsed, model, latencyMs };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - t0);
    const timedOut = err instanceof Error && err.name === 'AbortError';
    return { ok: false, data: null, model, latencyMs, error: timedOut ? `Timed out after ${TIMEOUT_MS}ms` : `Request failed: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonLoose(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Some models wrap JSON in prose or a ```json fence despite the instruction not to.
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return undefined;
    try {
      return JSON.parse(match[0]);
    } catch {
      return undefined;
    }
  }
}
