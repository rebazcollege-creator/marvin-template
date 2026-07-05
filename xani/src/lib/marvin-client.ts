import type {
  ActPayload,
  ActResult,
  ChatMessage,
  ChatRequest,
  InboxTriage,
  MailboxAction,
  ProposedMemory,
  SlackTriage,
  StreamEvent,
  WaitingOnData,
} from '@/lib/marvin-protocol';

/**
 * Renderer → sidecar transport. The sidecar owns the API key; the renderer only
 * sends the composed system blocks + conversation and consumes the SSE stream.
 *
 * Where the sidecar lives depends on how the app is being viewed:
 *   - Dev / packaged Tauri: same-machine loopback http://localhost:8787.
 *   - Remote hosting (Codespaces / a VPS / your LAN, opened from a phone):
 *     "localhost" would mean the phone, not the host — so the sidecar is reached
 *     through a same-origin reverse proxy at /__mv (see scripts/serve-remote.mjs).
 * NEXT_PUBLIC_MARVIN_SIDECAR_URL overrides everything when set.
 */
function resolveSidecarUrl(): string {
  const override = process.env.NEXT_PUBLIC_MARVIN_SIDECAR_URL;
  if (override) return override;
  if (typeof window !== 'undefined') {
    const { hostname, origin } = window.location;
    const loopback =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === 'tauri.localhost' ||
      hostname.endsWith('.localhost');
    if (!loopback) return `${origin}/__mv`; // remote: sidecar is reverse-proxied on this origin
  }
  return 'http://localhost:8787';
}

export const SIDECAR_URL = resolveSidecarUrl();

export async function streamMarvin(
  req: ChatRequest,
  onEvent: (e: StreamEvent) => void,
): Promise<void> {
  let resp: Response;
  try {
    resp = await fetch(`${SIDECAR_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  } catch {
    onEvent({
      type: 'error',
      message: `Can't reach MARVIN's runtime at ${SIDECAR_URL}. Start it with: npm run sidecar`,
    });
    return;
  }

  if (!resp.ok || !resp.body) {
    onEvent({ type: 'error', message: `MARVIN sidecar responded ${resp.status}.` });
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const line = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(5).trim()) as StreamEvent);
      } catch {
        // ignore malformed frame
      }
    }
  }
}

/** Resolve a pending write-tool confirmation so the agent loop can resume. */
export async function approveMarvin(id: string, approved: boolean): Promise<void> {
  try {
    await fetch(`${SIDECAR_URL}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, approved }),
    });
  } catch {
    // sidecar unreachable — nothing to resume
  }
}

/**
 * Execute an approved outward action through the sidecar (real send/create/post).
 * Returns { ok:false, offline:true } if the runtime isn't reachable, so the UI can
 * mark it approved-but-pending honestly instead of claiming it ran.
 */
export async function actMarvin(payload: ActPayload): Promise<ActResult & { offline?: boolean }> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/act`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload }),
    });
    if (!resp.ok) return { ok: false, error: `Runtime responded ${resp.status}.` };
    return (await resp.json()) as ActResult;
  } catch {
    return { ok: false, offline: true, error: 'Runtime offline.' };
  }
}

/**
 * Run a low-stakes mailbox action now (archive/read/star/trash an email, react/mark-read
 * on Slack). User-initiated, reversible — does NOT go through the Approvals send-gate.
 */
export async function mailboxAction(action: MailboxAction): Promise<ActResult & { offline?: boolean }> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/mailbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (!resp.ok) return { ok: false, error: `Runtime responded ${resp.status}.` };
    return (await resp.json()) as ActResult;
  } catch {
    return { ok: false, offline: true, error: 'Runtime offline — start it with: npm run dev:all' };
  }
}

/**
 * On-device transcription: send recorded audio to the sidecar, which runs a local
 * whisper binary. Audio never leaves the machine. Returns ok:false (with a clear
 * reason) when transcription isn't configured or the runtime is offline.
 */
export async function transcribeAudio(blob: Blob): Promise<{ ok: boolean; text?: string; error?: string; offline?: boolean }> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: blob,
    });
    if (!resp.ok) return { ok: false, error: `Runtime responded ${resp.status}.` };
    return (await resp.json()) as { ok: boolean; text?: string; error?: string };
  } catch {
    return { ok: false, offline: true, error: 'Runtime offline — start it with: npm run sidecar.' };
  }
}

/**
 * Store an integration credential in the runtime (dev: the sidecar's gitignored
 * creds file + live process.env; desktop uses the OS keychain instead). Lets keys
 * entered in Connections take effect immediately without editing .env.
 */
export async function setRuntimeCred(name: string, value: string): Promise<boolean> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/creds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, value }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/** Remove integration credentials from the runtime (disconnect). */
export async function clearRuntimeCreds(names: string[]): Promise<boolean> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/creds/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Real one-click sign-in — asks the sidecar to run the loopback OAuth flow (opens
 * the provider in the browser, captures the redirect, stores the token). Resolves
 * when the user finishes. Needs a one-time OAuth client (clientId + clientSecret).
 * Works for providers that allow a loopback redirect: Google and GitHub.
 */
export async function startOAuth(
  integration: string,
  clientId: string,
  clientSecret: string,
  /** Gmail only: which account slot (1–5) to store this account into. */
  slot?: number,
): Promise<{ ok: boolean; account?: string; error?: string; offline?: boolean }> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/oauth/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integration, clientId, clientSecret, slot }),
    });
    if (!resp.ok) return { ok: false, error: `Runtime responded ${resp.status}.` };
    return (await resp.json()) as { ok: boolean; account?: string; error?: string };
  } catch {
    return { ok: false, offline: true, error: 'Runtime offline — start it with: npm run dev:all' };
  }
}

/** Which integration credentials the runtime currently has (env-var name → present). */
export async function getCredStatus(): Promise<Record<string, boolean> | null> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/creds/status`);
    if (!resp.ok) return null;
    return (await resp.json()) as Record<string, boolean>;
  } catch {
    return null;
  }
}

/**
 * MARVIN email triage — the runtime reads the live inbox and classifies each message
 * as act / know / ignore (with a short reason). Returns null when the runtime is
 * unreachable so the UI can show an honest "start the runtime" state.
 */
export async function fetchInboxTriage(learned: string[] = []): Promise<InboxTriage | null> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/triage/inbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ learned }),
      cache: 'no-store',
    });
    if (!resp.ok) return null;
    return (await resp.json()) as InboxTriage;
  } catch {
    return null;
  }
}

/**
 * MARVIN Slack triage — the runtime reads recent DM/group/channel history and classifies
 * each message someone sent Rebaz as act / know / ignore. Returns null when the runtime is
 * unreachable so the UI can show an honest "start the runtime" state.
 */
export async function fetchSlackTriage(learned: string[] = []): Promise<SlackTriage | null> {
  // Slack history is rate-limited and the triage then calls the model (a spawned `claude`
  // process is slower than an API call) — cap the wait generously so the Home section never
  // spins forever, but allow the first cold read to finish. Subsequent reads hit the cache.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const resp = await fetch(`${SIDECAR_URL}/triage/slack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ learned }),
      cache: 'no-store',
      signal: ctrl.signal,
    });
    if (!resp.ok) return null;
    return (await resp.json()) as SlackTriage;
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      return { connected: true, triaged: [], error: 'Slack took too long to read (Slack rate limits or a slow first AI call). It caches after the first read — reload in a moment.' };
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Draft an email/Slack reply and RETURN THE ERROR when it fails (unlike
 * marvin-data.draftReply which collapses failures to null). Used by Home so the
 * real reason (billing, rate limit, no key) is shown to Rebaz.
 */
/**
 * Read a sample of Rebaz's OWN writing (sent email / his Slack messages) to seed the
 * voice profile. Read-only; needs a Slack USER token for the Slack side.
 */
export async function fetchWritingSamples(p: {
  medium: 'email' | 'slack';
  account?: string;
  workspace?: string;
}): Promise<{ ok: boolean; samples: string[]; error?: string }> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/history/sent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    });
    if (!resp.ok) return { ok: false, samples: [], error: `runtime responded ${resp.status}` };
    return (await resp.json()) as { ok: boolean; samples: string[]; error?: string };
  } catch {
    return { ok: false, samples: [], error: 'runtime unreachable — is it running? (npm run dev:all)' };
  }
}

/** Break a task into tiny, concrete first steps with time estimates. level 1..5 = coarse..fine. */
export interface TaskStep { step: string; estMins: number }
export async function breakdownTask(task: string, level = 3): Promise<{ ok: boolean; steps?: TaskStep[]; error?: string }> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/breakdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, level }),
    });
    if (!resp.ok) return { ok: false, error: `runtime responded ${resp.status}` };
    return (await resp.json()) as { ok: boolean; steps?: TaskStep[]; error?: string };
  } catch {
    return { ok: false, error: 'runtime unreachable — is it running? (npm run dev:all)' };
  }
}

/** Tone-check a draft before sending (P2). mode: check|soften|warm|formal. Read-only. */
export async function toneCheck(text: string, mode: 'check' | 'soften' | 'warm' | 'formal' = 'check'): Promise<{ ok: boolean; read?: string; rewrite?: string; error?: string }> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/tone-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, mode }),
    });
    if (!resp.ok) return { ok: false, error: `runtime responded ${resp.status}` };
    return (await resp.json()) as { ok: boolean; read?: string; rewrite?: string; error?: string };
  } catch {
    return { ok: false, error: 'runtime unreachable' };
  }
}

/** Summarise one item into a headline (+ audience) and return the full body for "see more". */
export async function summarizeItem(p: { kind: 'email' | 'slack'; account?: string; id?: string; workspace?: string; channel?: string }): Promise<{ ok: boolean; headline?: string; audience?: 'you' | 'team'; body?: string; error?: string }> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/summarize-item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    });
    if (!resp.ok) return { ok: false, error: `runtime responded ${resp.status}` };
    return (await resp.json()) as { ok: boolean; headline?: string; audience?: 'you' | 'team'; body?: string; error?: string };
  } catch {
    return { ok: false, error: 'runtime unreachable' };
  }
}

/** Understanding loop — ask the runtime for new clarifying questions about Rebaz's world. */
export async function generateQuestions(known: string[], asked: string[]): Promise<{ ok: boolean; questions?: { question: string; about?: string; context?: string }[]; error?: string }> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/train/generate-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ known, asked }),
    });
    if (!resp.ok) return { ok: false, error: `runtime responded ${resp.status}` };
    return (await resp.json()) as { ok: boolean; questions?: { question: string; about?: string; context?: string }[]; error?: string };
  } catch {
    return { ok: false, error: 'runtime unreachable — is it running? (npm run dev:all)' };
  }
}

/** Sort a raw brain-dump into a clean, classified, estimated item (P1.3). */
export async function sortDump(text: string): Promise<{ ok: boolean; task?: string; kind?: 'task' | 'note' | 'someday'; estMins?: number; error?: string }> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/sort-dump`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!resp.ok) return { ok: false, error: `runtime responded ${resp.status}` };
    return (await resp.json()) as { ok: boolean; task?: string; kind?: 'task' | 'note' | 'someday'; estMins?: number; error?: string };
  } catch {
    return { ok: false, error: 'runtime unreachable' };
  }
}

/** Voice corpus — deep harvest of Rebaz's own writing + patterns analysis (Train mode). */
export interface VoiceAnalysis {
  voiceNotes: Record<string, string[]>;
  patterns: string;
  analyzedAt: string;
}
export interface VoiceCorpusInfo {
  ok: boolean;
  stats?: Record<string, number>;
  updatedAt?: string;
  samples?: Record<string, string[]>;
  analysis?: VoiceAnalysis | null;
  summary?: Record<string, number>;
  error?: string;
}

/** Run a deep harvest pass (Slack per workspace + Gmail sent). Bounded per call; re-run to
 *  reach further back. Long-running (respects Slack rate limits) — no client timeout. */
export async function harvestVoice(opts: {
  media?: ('slack' | 'email')[];
  workspace?: string;
  maxConvos?: number;
  pagesPerConvo?: number;
  emailPages?: number;
} = {}): Promise<VoiceCorpusInfo> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/voice/harvest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    });
    if (!resp.ok) return { ok: false, error: `runtime responded ${resp.status}` };
    return (await resp.json()) as VoiceCorpusInfo;
  } catch {
    return { ok: false, error: 'runtime unreachable — is it running? (npm run dev:all)' };
  }
}

/** Analyse the harvested corpus into voice notes + a patterns report (uses the model). */
export async function analyzeVoice(): Promise<VoiceCorpusInfo> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/voice/analyze`, { method: 'POST' });
    if (!resp.ok) return { ok: false, error: `runtime responded ${resp.status}` };
    return (await resp.json()) as VoiceCorpusInfo;
  } catch {
    return { ok: false, error: 'runtime unreachable — is it running? (npm run dev:all)' };
  }
}

/** What's been gathered so far (stats + last analysis). */
export async function getVoiceCorpus(): Promise<VoiceCorpusInfo> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/voice/corpus`, { cache: 'no-store' });
    if (!resp.ok) return { ok: false, error: `runtime responded ${resp.status}` };
    return (await resp.json()) as VoiceCorpusInfo;
  } catch {
    return { ok: false, error: 'runtime unreachable' };
  }
}

export async function requestDraft(p: {
  account: string;
  from: string;
  subject: string;
  body: string;
  medium?: 'email' | 'slack';
  /** Rebaz's learned voice (his real writing) — makes the draft sound like him. */
  voice?: string;
}): Promise<{ ok: boolean; draft?: string; error?: string }> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/draft-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    });
    const j = (await resp.json().catch(() => ({}))) as { ok?: boolean; draft?: string; error?: string };
    if (!resp.ok) return { ok: false, error: j.error ?? `runtime responded ${resp.status}` };
    return { ok: Boolean(j.ok), draft: j.draft, error: j.error };
  } catch {
    return { ok: false, error: 'runtime unreachable — is it running? (npm run dev:all)' };
  }
}

/** True if the runtime (sidecar) is reachable. Used by the sidebar status dot. */
export interface SlackMatch { workspace: string; workspaceName: string; channel: string; user: string; text: string; ts: string; permalink: string }
export interface LookupResult {
  email: { connected: boolean; messages: { id: string; account: string; from: string; subject: string; snippet: string; receivedAt: string }[]; error?: string };
  slack: { connected: boolean; matches: SlackMatch[]; error?: string };
  error?: string;
}
/** Search the user's OWN email + Slack together (read-only, sidecar-side). */
export async function lookup(query: string): Promise<LookupResult> {
  try {
    const r = await fetch(`${SIDECAR_URL}/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    return (await r.json()) as LookupResult;
  } catch {
    return { email: { connected: false, messages: [] }, slack: { connected: false, matches: [] }, error: 'unreachable' };
  }
}

export interface WebSearchResult { title: string; url: string; snippet: string; age?: string }
/** Ask the sidecar to search the web (Brave). Safe: the sidecar fetches; the model
 *  never gets a tool. Returns {ok:false, error:'no_key'} when no key is configured. */
export async function webSearch(query: string, count = 5): Promise<{ ok: boolean; results: WebSearchResult[]; error?: string }> {
  try {
    const r = await fetch(`${SIDECAR_URL}/websearch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, count }),
    });
    return (await r.json()) as { ok: boolean; results: WebSearchResult[]; error?: string };
  } catch {
    return { ok: false, results: [], error: 'unreachable' };
  }
}

export interface MorningBrief { ok: boolean; text: string; at?: number; forDate?: string; dayOff?: boolean; error?: string }
/** MARVIN's morning brief — built by the heartbeat; served stale-while-revalidate. */
export async function getBrief(learned: string[] = []): Promise<MorningBrief> {
  try {
    const r = await fetch(`${SIDECAR_URL}/brief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ learned }),
    });
    return (await r.json()) as MorningBrief;
  } catch {
    return { ok: false, text: '' };
  }
}

/** Emails Rebaz sent that have gone quiet and still want a reply — the "you're still
 *  waiting on this" nudge. Served stale-while-revalidate; null when the runtime is down. */
export async function getWaiting(): Promise<WaitingOnData | null> {
  try {
    const r = await fetch(`${SIDECAR_URL}/waiting`, { cache: 'no-store' });
    return (await r.json()) as WaitingOnData;
  } catch {
    return null;
  }
}

export async function pingRuntime(): Promise<boolean> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/health`, { cache: 'no-store' });
    return resp.ok;
  } catch {
    return false;
  }
}

export interface RuntimeHealth {
  up: boolean;
  provider?: string;
  /** False on text-only providers (CLI/Gemini): chat can't read accounts or save learnings. */
  tools?: boolean;
  note?: string;
}

/** Health + capability honesty — so the UI can say WHAT the runtime can do, not just that it's up. */
export async function runtimeHealth(): Promise<RuntimeHealth> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/health`, { cache: 'no-store' });
    if (!resp.ok) return { up: false };
    const j = (await resp.json()) as { provider?: string; capabilities?: { tools?: boolean; note?: string } };
    return { up: true, provider: j.provider, tools: j.capabilities?.tools, note: j.capabilities?.note };
  } catch {
    return { up: false };
  }
}

/** Post-session learning: extract durable memories from a finished chat. */
export async function extractLearnings(
  messages: ChatMessage[],
  model: string,
): Promise<ProposedMemory[]> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, model }),
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { proposals?: ProposedMemory[] };
    return data.proposals ?? [];
  } catch {
    return [];
  }
}
