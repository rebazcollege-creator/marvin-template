import type {
  ActPayload,
  ActResult,
  ChatMessage,
  ChatRequest,
  InboxTriage,
  ProposedMemory,
  SlackTriage,
  StreamEvent,
} from '@/lib/marvin-protocol';

/**
 * Renderer → sidecar transport. The sidecar owns the API key; the renderer only
 * sends the composed system blocks + conversation and consumes the SSE stream.
 *
 * Dev: http://localhost:8787 (run `npm run sidecar`). Packaged Tauri app: the
 * same loopback port, spawned by Rust and allowed by the app capabilities.
 */

const SIDECAR_URL =
  process.env.NEXT_PUBLIC_MARVIN_SIDECAR_URL ?? 'http://localhost:8787';

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
export async function fetchInboxTriage(): Promise<InboxTriage | null> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/triage/inbox`, { cache: 'no-store' });
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
export async function fetchSlackTriage(): Promise<SlackTriage | null> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/triage/slack`, { cache: 'no-store' });
    if (!resp.ok) return null;
    return (await resp.json()) as SlackTriage;
  } catch {
    return null;
  }
}

/**
 * Draft an email/Slack reply and RETURN THE ERROR when it fails (unlike
 * marvin-data.draftReply which collapses failures to null). Used by Home so the
 * real reason (billing, rate limit, no key) is shown to Rebaz.
 */
export async function requestDraft(p: {
  account: string;
  from: string;
  subject: string;
  body: string;
  medium?: 'email' | 'slack';
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
export async function pingRuntime(): Promise<boolean> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/health`, { cache: 'no-store' });
    return resp.ok;
  } catch {
    return false;
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
