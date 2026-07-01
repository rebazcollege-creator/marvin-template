/**
 * Model provider switch — lets Xanî run on Google AI Studio (Gemini) instead of the
 * Anthropic API for testing, when Anthropic credits aren't available.
 *
 * Set GOOGLE_AI_API_KEY (or GEMINI_API_KEY) in .env.local and every model call —
 * triage, drafting, summarising, chat — routes to Gemini. Tool use is not translated
 * (Gemini path is text-only), so agentic tool loops degrade to a plain answer; the
 * visible features (triage + drafts) work fully. Remove the key to go back to Claude.
 */

const GEMINI_KEY = (): string => process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = (): string => process.env.GEMINI_MODEL || 'gemini-2.0-flash';

/** True when a Google AI key is configured — route model calls to Gemini. */
export function usingGemini(): boolean {
  return GEMINI_KEY().length > 0;
}

/** Flatten Anthropic-style system (string or SystemBlock[]) to plain text. */
function flattenSystem(system: unknown): string {
  if (typeof system === 'string') return system;
  if (Array.isArray(system)) return system.map((b) => (b as { text?: string })?.text ?? '').join('\n\n');
  return '';
}

/** Extract plain text from an Anthropic message content (string or block[]). */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        const blk = b as { type?: string; text?: string; content?: unknown };
        if (typeof b === 'string') return b;
        if (blk.type === 'text') return blk.text ?? '';
        if (blk.type === 'tool_result') {
          return typeof blk.content === 'string'
            ? blk.content
            : Array.isArray(blk.content)
              ? blk.content.map((c) => (c as { text?: string })?.text ?? '').join('\n')
              : '';
        }
        return '';
      })
      .join('\n');
  }
  return '';
}

/**
 * Run one generation on Gemini from Anthropic-shaped params. Returns the text; calls
 * onText once with the full text (so streaming callers still get their output).
 */
export async function geminiGenerate(
  params: { system?: unknown; messages: { role: string; content: unknown }[]; max_tokens?: number },
  onText?: (t: string) => void,
): Promise<string> {
  const key = GEMINI_KEY();
  if (!key) throw new Error('No Google AI key set.');
  const sys = flattenSystem(params.system);
  const contents = params.messages
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: textOf(m.content) }] }))
    .filter((c) => c.parts[0].text.trim().length > 0);

  const body = {
    ...(sys ? { system_instruction: { parts: [{ text: sys }] } } : {}),
    contents: contents.length ? contents : [{ role: 'user', parts: [{ text: '' }] }],
    generationConfig: { maxOutputTokens: params.max_tokens ?? 1024 },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL()}:generateContent?key=${encodeURIComponent(key)}`;
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  if (onText && text) onText(text);
  return text;
}
