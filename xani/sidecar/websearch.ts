/**
 * Server-side web search — the SAFE way to give MARVIN the web.
 *
 * Rather than hand the model an agentic tool belt (which, on the Claude CLI, also
 * exposes Bash/Write/Edit — a prompt-injection-to-RCE risk when untrusted email/Slack
 * sits in the context), the sidecar performs the search ITSELF and hands the results
 * to the model as reading material. The model never gets a tool; it just cites sources.
 * Works on every provider (CLI/Gemini/Anthropic) because it's context, not tool-use.
 *
 * Provider: Brave Search API (free tier, one key: BRAVE_SEARCH_API_KEY). Degrades
 * gracefully to {ok:false} with a reason — the caller shows an honest "add a key"
 * hint and never fabricates sources.
 */

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
  age?: string;
}
export interface WebSearchOut {
  ok: boolean;
  results: WebResult[];
  error?: string;
}

const strip = (s: string): string => (s ?? '').replace(/<[^>]+>/g, '').trim();

export async function braveWebSearch(query: string, count = 5): Promise<WebSearchOut> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return { ok: false, results: [], error: 'no_key' };
  const q = (query ?? '').trim().slice(0, 400);
  if (!q) return { ok: false, results: [], error: 'empty_query' };
  const n = Math.min(10, Math.max(1, count));
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${n}&safesearch=off&text_decorations=false`;
    const r = await fetch(url, {
      headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': key },
      signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) {
      const detail = r.status === 401 || r.status === 403 ? 'bad_key' : `Brave API ${r.status}`;
      return { ok: false, results: [], error: detail };
    }
    const j = (await r.json()) as { web?: { results?: { title?: string; url?: string; description?: string; age?: string }[] } };
    const results = (j.web?.results ?? [])
      .slice(0, n)
      .map((x) => ({ title: strip(x.title ?? ''), url: x.url ?? '', snippet: strip(x.description ?? ''), age: x.age }))
      .filter((x) => x.url);
    return { ok: true, results };
  } catch (e) {
    const msg = (e as Error).name === 'TimeoutError' ? 'timeout' : (e as Error).message;
    return { ok: false, results: [], error: msg };
  }
}
