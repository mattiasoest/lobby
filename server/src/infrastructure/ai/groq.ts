export type GroqChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type GenerateChatNpcReplyOptions = {
  systemPrompt: string;
  history: GroqChatMessage[];
  model: string;
  fallbackModel: string;
  apiKey: string;
};

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_TOKENS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(header: string | null): number {
  if (!header) return 1_000;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 5_000);
  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) return Math.max(0, Math.min(dateMs - Date.now(), 5_000));
  return 1_000;
}

async function callGroq(
  apiKey: string,
  model: string,
  messages: GroqChatMessage[],
): Promise<{ ok: true; content: string } | { ok: false; status: number; retryAfterMs: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: MAX_TOKENS,
        temperature: 0.8,
      }),
      signal: controller.signal,
    });

    if (res.status === 429) {
      return { ok: false, status: 429, retryAfterMs: parseRetryAfterMs(res.headers.get('retry-after')) };
    }

    if (!res.ok) {
      return { ok: false, status: res.status, retryAfterMs: 0 };
    }

    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content?.trim() ?? '';
    if (!content) {
      return { ok: false, status: res.status, retryAfterMs: 0 };
    }
    return { ok: true, content };
  } catch {
    return { ok: false, status: 0, retryAfterMs: 0 };
  } finally {
    clearTimeout(timer);
  }
}

/** Returns trimmed reply text, or null if Groq is unavailable / rate-limited. */
export async function generateChatNpcReply(opts: GenerateChatNpcReplyOptions): Promise<string | null> {
  const messages: GroqChatMessage[] = [{ role: 'system', content: opts.systemPrompt }, ...opts.history];

  const primary = await callGroq(opts.apiKey, opts.model, messages);
  if (primary.ok) return primary.content.slice(0, 500);

  if (primary.status === 429) {
    await sleep(primary.retryAfterMs);
    const fallback = await callGroq(opts.apiKey, opts.fallbackModel, messages);
    if (fallback.ok) return fallback.content.slice(0, 500);
  }

  return null;
}
