import { WebClient } from '@slack/web-api';
import { sanitizeHeader, encodeSubject, sanitizeRecipients } from './mail.ts';
import type {
  BriefingData,
  InboxData,
  TrelloData,
  CalendarData,
  SlackData,
  SlackHistory,
  BufferData,
  DriveData,
  GithubData,
  ActPayload,
  ActResult,
  MailboxAction,
} from '../src/lib/marvin-protocol.ts';

/**
 * Integration connectors (sidecar side) — "ready but stubbed".
 *
 * All run in the sidecar so tokens never reach the renderer. Each is cred-gated:
 * with no credentials it reports connected:false and returns nothing (no mock
 * data); with credentials it performs the real call.
 *
 * Mechanisms follow the settled architecture:
 *   - Gmail (5 accounts) + Google Calendar: real REST via OAuth refresh tokens.
 *   - Slack: real via @slack/web-api (bot token). Posting is gated by Approvals.
 *   - Trello: Zapier MCP — pending MCP wiring (gated).
 *   - Buffer: Direct MCP — pending MCP wiring (gated).
 */

const GMAIL_ACCOUNTS = [
  { role: 'personal', n: 1 },
  { role: 'moonshot', n: 2 },
  { role: 'leadstories', n: 3 },
  { role: 'zoho', n: 4 },
  { role: 'amargi', n: 5 },
] as const;

async function googleAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string | null> {
  return (await googleToken(clientId, clientSecret, refreshToken)).token ?? null;
}

/** Token exchange that also surfaces the error (for honest diagnostics). */
async function googleToken(clientId: string, clientSecret: string, refreshToken: string): Promise<{ token?: string; error?: string }> {
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    });
    const body = await r.text();
    if (!r.ok) return { error: `auth ${r.status}: ${body.slice(0, 160)}` };
    const j = JSON.parse(body) as { access_token?: string };
    return j.access_token ? { token: j.access_token } : { error: 'no access_token returned' };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

function gmailCreds(n: number): { id: string; secret: string; refresh: string } | null {
  const id = process.env[`GMAIL_CLIENT_ID_${n}`];
  const secret = process.env[`GMAIL_CLIENT_SECRET_${n}`];
  const refresh = process.env[`GMAIL_REFRESH_TOKEN_${n}`];
  return id && secret && refresh ? { id, secret, refresh } : null;
}

// ── Gmail ─────────────────────────────────────────────────────────

export async function gmailUnreadCounts(): Promise<{ connected: boolean; accounts: { account: string; unread: number }[] }> {
  const connected = GMAIL_ACCOUNTS.map((a) => ({ a, c: gmailCreds(a.n) })).filter((x) => x.c);
  // All accounts in parallel — previously sequential (token + fetch per account).
  const results = await Promise.all(
    connected.map(async ({ a, c }) => {
      const token = await googleAccessToken(c!.id, c!.secret, c!.refresh);
      if (!token) return null;
      try {
        const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) return null;
        const j = (await r.json()) as { messagesUnread?: number };
        return { account: a.role, unread: j.messagesUnread ?? 0 };
      } catch {
        return null;
      }
    }),
  );
  return { connected: connected.length > 0, accounts: results.filter((x): x is NonNullable<typeof x> => x != null) };
}

/** Gmail search query per Gmail-clone folder. */
const FOLDER_QUERY: Record<string, string> = {
  inbox: 'in:inbox',
  starred: 'is:starred',
  sent: 'in:sent',
  drafts: 'in:drafts',
  spam: 'in:spam',
  trash: 'in:trash',
};

/** Run async `fn` over `items` with bounded concurrency, preserving order. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Classify a message into a triage split from its real Gmail labels + subject. */
function splitFor(labelIds: string[], subject: string): 'important' | 'calendar' | 'news' | 'other' {
  if (labelIds.includes('IMPORTANT')) return 'important';
  if (/invite|invitation|termin|meeting|calendar|rsvp|reschedul|agenda/i.test(subject)) return 'calendar';
  if (labelIds.some((l) => l === 'CATEGORY_PROMOTIONS' || l === 'CATEGORY_UPDATES' || l === 'CATEGORY_FORUMS' || l === 'CATEGORY_SOCIAL')) return 'news';
  return 'other';
}

// Short-TTL cache so re-renders and folder toggles don't re-hit Gmail. Busted on
// any credential change (connect/disconnect) via bumpInboxCache().
type InboxCacheEntry = { ts: number; ver: number; data: InboxData };
const inboxCache = new Map<string, InboxCacheEntry>();
let inboxCacheVer = 0;
const INBOX_TTL_MS = 25_000;
export function bumpInboxCache(): void {
  inboxCacheVer++;
  inboxCache.clear();
}

const META_PARAMS = 'format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=To';
const PAGE_SIZE = 30;

/** Fetch metadata for many message ids in ONE HTTP request via Gmail's batch
 *  endpoint (https://gmail.googleapis.com/batch/gmail/v1), instead of one request
 *  per id. This collapses N network round-trips into 1 — the single biggest reason
 *  a cold inbox felt slow. Returns null on failure so the caller can fall back to
 *  individual gets. Quota cost is unchanged; latency is hugely reduced. */
async function gmailBatchGetMetadata(token: string, ids: string[]): Promise<Record<string, unknown>[] | null> {
  if (ids.length === 0) return [];
  const boundary = `xani_batch_${ids.length}_${ids[0]}`;
  const body =
    ids
      .map(
        (id) =>
          `--${boundary}\r\nContent-Type: application/http\r\n\r\n` +
          `GET /gmail/v1/users/me/messages/${id}?${META_PARAMS}\r\n\r\n`,
      )
      .join('') + `--${boundary}--`;
  try {
    const r = await fetch('https://gmail.googleapis.com/batch/gmail/v1', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/mixed; boundary=${boundary}` },
      body,
    });
    if (!r.ok) return null;
    return parseBatchResponse(r.headers.get('content-type') ?? '', await r.text());
  } catch {
    return null;
  }
}

/** Parse a Gmail batch (multipart/mixed) response body into one JSON object per
 *  part. Exported for tests — this hand-rolled parser is load-bearing for cold
 *  inbox loads and must not regress silently. */
export function parseBatchResponse(contentType: string, text: string): Record<string, unknown>[] {
  // Google replies with its own boundary; read it from the response Content-Type.
  const bm = contentType.match(/boundary=([^;]+)/);
  const respBoundary = bm?.[1]?.trim().replace(/^"|"$/g, '') ?? null;
  const parts = respBoundary ? text.split(`--${respBoundary}`) : [text];
  const out: Record<string, unknown>[] = [];
  for (const part of parts) {
    // Each part wraps one HTTP response whose body is a single JSON object.
    const s = part.indexOf('{');
    const e = part.lastIndexOf('}');
    if (s === -1 || e <= s) continue;
    try {
      out.push(JSON.parse(part.slice(s, e + 1)) as Record<string, unknown>);
    } catch {
      /* skip a malformed part */
    }
  }
  return out;
}

/** Shape one Gmail message JSON (metadata format) into an inbox row. */
function rowFromMessage(dj: unknown, accountRole: string): InboxData['messages'][number] | null {
  if (!dj || typeof dj !== 'object') return null;
  const j = dj as { id?: string; snippet?: string; internalDate?: string; labelIds?: string[]; payload?: { headers?: { name: string; value: string }[] } };
  if (!j.id) return null;
  const header = (name: string) => j.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? '';
  const labels = j.labelIds ?? [];
  const subject = header('subject');
  return {
    id: j.id,
    account: accountRole,
    from: header('from'),
    subject,
    snippet: j.snippet ?? '',
    receivedAt: j.internalDate ? new Date(Number(j.internalDate)).toISOString() : '',
    unread: labels.includes('UNREAD'),
    to: header('to'),
    split: splitFor(labels, subject),
  };
}

/**
 * Inbox for the given folder. Fetches metadata in one batched request per account
 * (fast cold-load), and supports cursor-based pagination so older history loads on
 * demand instead of all at once. `cursorRaw` is the opaque per-account page cursor
 * returned in the previous response; omit it for the first page.
 */
export async function getInbox(folder = 'inbox', cursorRaw = ''): Promise<InboxData> {
  const cacheKey = `${folder}|${cursorRaw}`;
  const cached = inboxCache.get(cacheKey);
  if (cached && cached.ver === inboxCacheVer && Date.now() - cached.ts < INBOX_TTL_MS) return cached.data;

  const q = FOLDER_QUERY[folder] ?? FOLDER_QUERY.inbox ?? 'in:inbox';
  const connectedAccounts = GMAIL_ACCOUNTS.map((a) => ({ a, c: gmailCreds(a.n) })).filter((x) => x.c);
  const errs: string[] = [];

  let cursor: Record<string, string> = {};
  if (cursorRaw) {
    try { cursor = JSON.parse(cursorRaw) as Record<string, string>; } catch { /* treat as first page */ }
  }
  const paged = Boolean(cursorRaw);
  // On "load more", only re-hit accounts that still have more pages.
  const targets = paged ? connectedAccounts.filter((x) => cursor[x.a.role]) : connectedAccounts;
  const nextCursor: Record<string, string> = {};

  const perAccount = await Promise.all(
    targets.map(async ({ a, c }) => {
      const { token, error } = await googleToken(c!.id, c!.secret, c!.refresh);
      if (!token) {
        errs.push(`${a.role}: ${error ?? 'authentication failed'}`);
        return [] as InboxData['messages'];
      }
      try {
        const pageToken = cursor[a.role];
        const listUrl =
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${PAGE_SIZE}` +
          (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
        const list = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
        if (!list.ok) {
          errs.push(`${a.role}: Gmail API ${list.status} — ${(await list.text()).slice(0, 160)}`);
          return [];
        }
        const lj = (await list.json()) as { messages?: { id: string }[]; nextPageToken?: string };
        const ids = (lj.messages ?? []).map((m) => m.id);
        if (lj.nextPageToken) nextCursor[a.role] = lj.nextPageToken;
        if (ids.length === 0) return [];

        // One batched request; degrade to bounded parallel gets if batch fails.
        let msgs = await gmailBatchGetMetadata(token, ids);
        if (!msgs) {
          msgs = (
            await mapPool(ids, 12, async (id) => {
              const det = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?${META_PARAMS}`,
                { headers: { Authorization: `Bearer ${token}` } },
              );
              return det.ok ? ((await det.json()) as Record<string, unknown>) : null;
            })
          ).filter((x): x is Record<string, unknown> => x != null);
        }
        return msgs.map((dj) => rowFromMessage(dj, a.role)).filter((r): r is InboxData['messages'][number] => r != null);
      } catch (e) {
        errs.push(`${a.role}: ${(e as Error).message}`);
        return [];
      }
    }),
  );

  const messages = perAccount.flat();
  messages.sort((x, y) => (y.receivedAt > x.receivedAt ? 1 : y.receivedAt < x.receivedAt ? -1 : 0));
  let error: string | undefined;
  if (messages.length === 0 && errs.length) {
    error = errs.some((e) => /auth/i.test(e))
      ? `Couldn’t sign in to Gmail — ${errs[0]}. Reconnect with “Sign in with Google”.`
      : errs[0];
  }
  const data: InboxData = {
    connected: connectedAccounts.length > 0,
    messages,
    error,
    cursor: Object.keys(nextCursor).length ? JSON.stringify(nextCursor) : undefined,
  };
  inboxCache.set(cacheKey, { ts: Date.now(), ver: inboxCacheVer, data });
  return data;
}

/** Decode a base64url Gmail body part to text. */
function decodeB64(data: string): string {
  try {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  } catch {
    return '';
  }
}

/** Collapse an HTML body to readable plain text (fallback / for the AI drafter). */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>(?=)/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Walk a Gmail payload tree, collecting the richest HTML and a plain-text fallback. */
function extractBody(payload: unknown): { html: string; text: string } {
  type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };
  const plains: string[] = [];
  const htmls: string[] = [];
  const walk = (p?: Part) => {
    if (!p) return;
    if (p.body?.data) {
      if (p.mimeType === 'text/plain') plains.push(decodeB64(p.body.data));
      else if (p.mimeType === 'text/html') htmls.push(decodeB64(p.body.data));
    }
    for (const c of p.parts ?? []) walk(c);
  };
  walk(payload as Part);
  const html = htmls.join('\n').trim();
  // Prefer a real plain part for the text fallback; else derive it from the HTML.
  const text = (plains.join('\n').trim() || (html ? htmlToText(html) : '')).trim();
  return { html, text };
}

/** Full body of a single message, for the reading pane. Cred-gated per account.
 *  Returns the original HTML (rendered sandboxed in the UI) + a plain-text fallback. */
export async function getMessageBody(
  accountRole: string,
  id: string,
): Promise<{
  ok: boolean;
  html?: string;
  text?: string;
  body?: string;
  error?: string;
  // Reply context — lets the drafter build a properly threaded reply.
  threadId?: string;
  messageId?: string;
  references?: string;
  subject?: string;
  from?: string;
  to?: string;
  replyTo?: string;
}> {
  const acct = GMAIL_ACCOUNTS.find((a) => a.role === accountRole);
  const c = acct ? gmailCreds(acct.n) : null;
  if (!c || !id) return { ok: false, error: 'Not connected.' };
  const { token, error } = await googleToken(c.id, c.secret, c.refresh);
  if (!token) return { ok: false, error: error ?? 'auth failed' };
  try {
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return { ok: false, error: `Gmail API ${r.status}` };
    const j = (await r.json()) as { threadId?: string; payload?: { headers?: { name?: string; value?: string }[] }; snippet?: string };
    const { html, text } = extractBody(j.payload);
    const plain = text || (j.snippet ?? '');
    // Reply metadata so a drafted reply can go to the right address and thread.
    const hdr = (name: string): string | undefined =>
      (j.payload?.headers ?? []).find((h) => (h.name ?? '').toLowerCase() === name.toLowerCase())?.value;
    return {
      ok: true,
      html,
      text: plain,
      body: plain, // kept for backward compatibility
      threadId: j.threadId,
      messageId: hdr('Message-ID') ?? hdr('Message-Id'),
      references: hdr('References'),
      subject: hdr('Subject'),
      from: hdr('From'),
      to: hdr('To'),
      replyTo: hdr('Reply-To') || hdr('From'),
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── Writing voice (Rebaz's own sent mail + Slack messages) ────────
// The raw material for "sound like me": his real writing, read straight from the
// sources (Gmail sent, Slack history filtered to his own user). No model call —
// these become style exemplars the drafter mimics. Read-only.

/** Trim a raw message to a clean voice sample: drop quoted history + cap length. */
function cleanSample(raw: string): string {
  let t = (raw || '').replace(/\r/g, '');
  const cut = t.search(/\n\s*>|\nOn .+wrote:|\n-{2,}\s*Original Message|\nFrom: .+@/);
  if (cut > 0) t = t.slice(0, cut);
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  return t.length > 500 ? `${t.slice(0, 500).trim()}…` : t;
}

export async function getWritingSamples(p: {
  medium: 'email' | 'slack';
  account?: string;
  workspace?: string;
}): Promise<{ ok: boolean; samples: string[]; error?: string }> {
  try {
    if (p.medium === 'email') {
      const sent = await getInbox('sent', '');
      if (!sent.connected) return { ok: false, samples: [], error: sent.error ?? 'Gmail not connected.' };
      const rows = sent.messages.filter((m) => !p.account || m.account === p.account).slice(0, 8);
      if (rows.length === 0) return { ok: true, samples: [] };
      const bodies = await Promise.all(
        rows.map(async (m) => {
          const b = await getMessageBody(m.account, m.id);
          return cleanSample(b.text || b.body || m.snippet || '');
        }),
      );
      return { ok: true, samples: bodies.filter((s) => s.length >= 12).slice(0, 6) };
    }

    // Slack — needs a user token to see his own messages (a bot can't).
    const slack = await getSlack();
    if (!slack.connected) return { ok: false, samples: [], error: slack.error ?? 'Slack not connected.' };
    const ws = slack.workspaces.find((w) => !p.workspace || w.role === p.workspace);
    const selfId = ws?.selfId;
    if (!selfId) return { ok: false, samples: [], error: 'Slack needs a USER token (xoxp-) to read your own messages.' };
    const convos = slack.channels.filter((c) => !p.workspace || c.workspace === p.workspace).slice(0, 6);
    // Sequential — conversations.history is rate-limited hard; never burst it.
    const mine: string[] = [];
    for (const c of convos) {
      let h: SlackHistory | null = null;
      try { h = await getSlackHistory({ workspace: c.workspace, channel: c.id, limit: 30 }); } catch { h = null; }
      if (!h || !h.ok) continue;
      for (const m of h.messages) {
        if (m.userId !== selfId) continue;
        const t = cleanSample(m.text || '');
        if (t.length >= 8) mine.push(t); // skip trivial "ok"/emoji-only
      }
    }
    return { ok: true, samples: mine.slice(0, 14) };
  } catch (e) {
    return { ok: false, samples: [], error: (e as Error).message };
  }
}

// ── Google Calendar ───────────────────────────────────────────────

export async function getCalendar(): Promise<CalendarData> {
  const id = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const secret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const refresh = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  if (!id || !secret || !refresh) return { connected: false, events: [] };
  const token = await googleAccessToken(id, secret, refresh);
  if (!token) return { connected: false, events: [] };

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const url =
    'https://www.googleapis.com/calendar/v3/calendars/primary/events' +
    `?singleEvents=true&orderBy=startTime&timeMin=${start.toISOString()}&timeMax=${end.toISOString()}`;
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return { connected: true, events: [], error: `Google Calendar API ${r.status}` };
    const j = (await r.json()) as {
      items?: { summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }[];
    };
    const events = (j.items ?? []).map((e) => ({
      title: e.summary ?? '(busy)',
      start: e.start?.dateTime ?? e.start?.date ?? '',
      end: e.end?.dateTime ?? e.end?.date ?? '',
      allDay: Boolean(e.start?.date && !e.start?.dateTime),
    }));
    return { connected: true, events };
  } catch (e) {
    return { connected: true, events: [], error: (e as Error).message };
  }
}

// ── Google Drive ──────────────────────────────────────────────────

function driveKind(mime?: string): DriveData['files'][number]['kind'] {
  if (!mime) return 'file';
  if (mime === 'application/vnd.google-apps.folder') return 'folder';
  if (mime.includes('document')) return 'doc';
  if (mime.includes('spreadsheet')) return 'sheet';
  if (mime.includes('presentation')) return 'slide';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  return 'file';
}

export async function getDrive(): Promise<DriveData> {
  const id = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const secret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const refresh = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  if (!id || !secret || !refresh) return { connected: false, files: [] };
  const token = await googleAccessToken(id, secret, refresh);
  if (!token) return { connected: false, files: [] };

  const url =
    'https://www.googleapis.com/drive/v3/files' +
    '?orderBy=folder,modifiedTime desc&pageSize=50&q=trashed=false' +
    '&fields=files(id,name,mimeType,modifiedTime,starred)';
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return { connected: true, files: [], error: `Google Drive API ${r.status}` };
    const j = (await r.json()) as {
      files?: { id?: string; name?: string; mimeType?: string; modifiedTime?: string; starred?: boolean }[];
    };
    const files = (j.files ?? []).map((f) => ({
      id: f.id ?? '',
      name: f.name ?? '(untitled)',
      kind: driveKind(f.mimeType),
      modified: f.modifiedTime ?? '',
      starred: Boolean(f.starred),
    }));
    return { connected: true, files };
  } catch (e) {
    return { connected: true, files: [], error: (e as Error).message };
  }
}

// ── Slack ─────────────────────────────────────────────────────────
// Multi-workspace, each with its own bot token. Channels are auto-discovered
// (no hardcoded IDs): we list the channels the bot is a member of and pull recent
// history. Display names + reactions come straight from Slack — never mocked.

// Each workspace can have a USER token (xoxp — unlocks unread + DMs, used for
// reads) and/or a BOT token (xoxb — used for posting). Reads prefer the user token.
const SLACK_WORKSPACES = [
  // `match` = a lowercase substring the real workspace's team name/URL should contain.
  // If auth.test's team doesn't contain it, the token is pointing at the wrong Slack and
  // we flag `mismatch` — this is how a token minted in the wrong workspace is surfaced.
  { role: 'amargi', name: 'The Amargi', env: 'SLACK_AMARGI_BOT_TOKEN', userEnv: 'SLACK_AMARGI_USER_TOKEN', avBg: '#C0613A', match: 'amargi' },
  { role: 'leadstories', name: 'LeadStories', env: 'SLACK_LEADSTORIES_BOT_TOKEN', userEnv: 'SLACK_LEADSTORIES_USER_TOKEN', avBg: '#6E8B6A', match: 'leadstories' },
];
type SlackWs = (typeof SLACK_WORKSPACES)[number];

const slackReadToken = (w: SlackWs) => process.env[w.userEnv] || process.env[w.env];
const slackTokenKind = (w: SlackWs): 'user' | 'bot' | undefined =>
  process.env[w.userEnv] ? 'user' : process.env[w.env] ? 'bot' : undefined;
const slackPostToken = (w: SlackWs) => process.env[w.env] || process.env[w.userEnv];

const EMERGENCY_RE = /\b(emergency|urgent|asap|breaking|trend drop)\b/i;
const MAX_SLACK_CONVOS = 60;
// Reject rate-limited calls immediately instead of retrying every 10s forever — a 429
// then just throws, we catch it and move on. This is what prevents a retry-storm from
// ever building up, no matter how many callers or how strict Slack's tier is.
const SLACK_WC_OPTS = { rejectRateLimitedCalls: true } as const;

/** Inject display names into bare user mentions (<@U123> → <@U123|Name>) so the
 *  renderer can show "@Name" without shipping the whole user directory. */
function resolveMentions(text: string, names: Map<string, string>): string {
  return text.replace(/<@([A-Z0-9]+)>/g, (m, id) => (names.has(id) ? `<@${id}|${names.get(id)}>` : m));
}

// Cache the user directory per workspace (users.list is heavy — shouldn't run on every
// history fetch). 5-minute TTL. We keep: id→display name, id→avatar URL (real photo when the
// user has one; Slack still serves a default coloured-initials image otherwise), and
// username→id so group-DM names ("mpdm-alice--bob--carol-1") can be resolved to people.
type SlackDir = { map: Map<string, string>; images: Map<string, string>; byUser: Map<string, string> };
const slackNamesCache = new Map<string, { at: number; dir: SlackDir }>();
function slackDir(role: string): SlackDir {
  return slackNamesCache.get(role)?.dir ?? { map: new Map(), images: new Map(), byUser: new Map() };
}
async function slackNames(role: string, client: WebClient): Promise<Map<string, string>> {
  const cached = slackNamesCache.get(role);
  if (cached && Date.now() - cached.at < 300_000) return cached.dir.map;
  const map = new Map<string, string>();
  const images = new Map<string, string>();
  const byUser = new Map<string, string>();
  try {
    let cursor: string | undefined;
    do {
      const ul = await client.users.list({ limit: 200, ...(cursor ? { cursor } : {}) });
      for (const u of ul.members ?? []) {
        if (!u.id) continue;
        map.set(u.id, u.profile?.display_name || u.real_name || u.name || u.id);
        const img = u.profile?.image_72 || u.profile?.image_48 || u.profile?.image_192 || '';
        if (img) images.set(u.id, img);
        if (u.name) byUser.set(u.name, u.id);
      }
      cursor = ul.response_metadata?.next_cursor || undefined;
    } while (cursor);
  } catch {
    /* users:read may be absent — fall back to ids */
  }
  slackNamesCache.set(role, { at: Date.now(), dir: { map, images, byUser } });
  return map;
}

/** Human name for a group DM ("mpdm-alice--bob--carol-1") → "Alice, Bob, Carol" (minus you). */
function mpimDisplayName(rawName: string, role: string, selfId?: string): string {
  const m = /^mpdm-(.+?)-1$/.exec(rawName);
  if (!m) return rawName;
  const dir = slackDir(role);
  const names = (m[1] ?? '')
    .split('--')
    .map((uname) => {
      const id = dir.byUser.get(uname);
      if (id && id === selfId) return null; // drop yourself
      return (id && dir.map.get(id)) || uname;
    })
    .filter(Boolean) as string[];
  return names.length ? names.join(', ') : rawName;
}

/**
 * Channel/DM list with unread state — deliberately uses only conversations.list +
 * conversations.info (Tier 3, NOT the rate-limited history method), so the sidebar
 * loads fast even for apps on Slack's new 15-msg/min history tier. Full message
 * history is fetched on demand by getSlackHistory.
 *
 * Unread is real only with a USER token: conversations.info returns the calling
 * user's last_read + unread_count_display. A bot token has no read state, so
 * unread is reported as 0/false (we never fake it).
 */
// Cache the sidebar read — Home, the Slack page, and the 60s watcher all call getSlack;
// without this they each re-run the conversations.info fan-out and trip Slack's rate limit.
let slackDataCache: { at: number; data: SlackData } | null = null;
let slackInflight: Promise<SlackData> | null = null;
const SLACK_TTL_MS = 90_000;
/** Only enrich this many conversations per workspace with conversations.info (unread/preview).
 *  Bounded + pooled so we never burst past Slack's Tier-3 limit. DMs are prioritised. */
const SLACK_INFO_CAP = 32;
export function bumpSlackCache(): void { slackDataCache = null; }

export async function getSlack(): Promise<SlackData> {
  if (slackDataCache && Date.now() - slackDataCache.at < SLACK_TTL_MS) return slackDataCache.data;
  // Dedupe concurrent callers (Home + Slack page + the 60s watcher) — one read, not three.
  if (slackInflight) return slackInflight;
  slackInflight = computeSlack();
  try { return await slackInflight; } finally { slackInflight = null; }
}

async function computeSlack(): Promise<SlackData> {
  const active = SLACK_WORKSPACES.filter((w) => slackReadToken(w));
  if (active.length === 0) return { connected: false, workspaces: [], channels: [], messages: [] };

  const workspaces: SlackData['workspaces'] = [];
  const channels: SlackData['channels'] = [];
  const messages: SlackData['messages'] = [];
  const topErrs: string[] = [];

  await Promise.all(
    active.map(async (w) => {
      const kind = slackTokenKind(w);
      const wsRec = { role: w.role, name: w.name, avBg: w.avBg, tokenKind: kind } as SlackData['workspaces'][number];
      workspaces.push(wsRec);
      const client = new WebClient(slackReadToken(w), SLACK_WC_OPTS);
      try {
        const auth = await client.auth.test(); // fail fast with a precise error (invalid_auth, token_revoked…)
        const a = auth as { user_id?: string; team?: string; team_id?: string; url?: string };
        wsRec.selfId = a.user_id; // so triage can drop Rebaz's own messages
        // Which workspace does this token REALLY belong to? Surface it so a token minted in the
        // wrong Slack is obvious instead of silently mislabeled.
        wsRec.team = a.team;
        wsRec.teamId = a.team_id;
        wsRec.teamUrl = a.url;
        const hay = `${a.team ?? ''} ${a.url ?? ''}`.toLowerCase();
        wsRec.mismatch = Boolean(w.match) && hay.length > 0 && !hay.includes(w.match);
        const names = await slackNames(w.role, client);
        // DMs only exist for user tokens (a bot can't see your DMs).
        const types = kind === 'user' ? 'public_channel,private_channel,im,mpim' : 'public_channel,private_channel';
        const list = await client.conversations.list({ types, exclude_archived: true, limit: 1000 });
        const convos = (list.channels ?? []).filter((c) => c.is_member || c.is_im || c.is_mpim).slice(0, MAX_SLACK_CONVOS);

        // Read-state, computed the way a real Slack client does it. Modern Slack drops
        // `unread_count_display` from conversations.info and frequently omits `latest`,
        // so we trust neither: conversations.info gives `last_read`, conversations.history
        // gives the actual newest messages, and unread = "messages newer than last_read
        // that Rebaz didn't send himself". Both calls are bounded (SLACK_INFO_CAP, DM-first)
        // and pooled; a strict-tier app (rejectRateLimitedCalls) degrades to info.latest or
        // no badge instead of a 429 storm.
        type SlackMsg = { text?: string; user?: string; ts?: string; reactions?: { name?: string; count?: number }[]; reply_count?: number; subtype?: string };
        type Enriched = { latest?: SlackMsg; latestTs?: string; unreadCount: number; hasUnread: boolean };
        const rank = (c: typeof convos[number]) => (c.is_im ? 3 : c.is_mpim ? 2 : c.is_member ? 1 : 0);
        const enrich = [...convos].sort((a, b) => rank(b) - rank(a)).slice(0, SLACK_INFO_CAP);
        const enrichById = new Map<string, Enriched>();
        await mapPool(enrich, 4, async (c) => {
          if (!c.id) return;
          const [infoR, histR] = await Promise.all([
            client.conversations.info({ channel: c.id }).catch(() => null),
            client.conversations.history({ channel: c.id, limit: 15 }).catch(() => null),
          ]);
          const ch = (infoR?.channel ?? {}) as { last_read?: string; latest?: SlackMsg; unread_count_display?: number };
          const lastRead = ch.last_read;
          const hist = ((histR?.messages ?? []) as SlackMsg[]).filter((m) => !m.subtype || m.subtype === 'thread_broadcast');
          // Prefer real history; fall back to info.latest on a rate-limited (strict) tier.
          const pool = hist.length ? hist : (ch.latest ? [ch.latest] : []);
          const latest = pool[0];
          const newer = lastRead
            ? pool.filter((m) => m.ts && Number(m.ts) > Number(lastRead) && m.user !== wsRec.selfId)
            : [];
          const display = typeof ch.unread_count_display === 'number' ? ch.unread_count_display : 0;
          const unreadCount = newer.length || display;
          enrichById.set(c.id, { latest, latestTs: latest?.ts, unreadCount, hasUnread: unreadCount > 0 });
        });

        for (const c of convos) {
            if (!c.id) continue;
            const en = enrichById.get(c.id);
            const latest = en?.latest;
            const latestTs = en?.latestTs;
            const unreadCount = en?.unreadCount ?? 0;
            const hasUnread = en?.hasUnread ?? false;
            const ckind: SlackData['channels'][number]['kind'] = c.is_im ? 'dm' : c.is_mpim ? 'group' : 'channel';
            const dir = slackDir(w.role);
            const name = c.is_im
              ? (c.user && names.get(c.user)) || 'direct message'
              : c.is_mpim
                ? mpimDisplayName(c.name || '', w.role, wsRec.selfId)
                : c.name || 'channel';
            // For a DM, the avatar is the other person's photo; group DMs get no single photo.
            const avatar = c.is_im && c.user ? dir.images.get(c.user) : undefined;

            channels.push({
              workspace: w.role,
              id: c.id,
              name,
              kind: ckind,
              topic: c.topic?.value || undefined,
              unread: unreadCount,
              hasUnread,
              lastTs: latestTs,
              preview: latest?.text || undefined,
              avatar,
              userId: c.is_im ? c.user : undefined,
            });
            if (latest?.text) {
              messages.push({
                workspace: w.role,
                channelId: c.id,
                channel: name,
                user: (latest.user && names.get(latest.user)) || latest.user || 'unknown',
                userId: latest.user,
                avatar: latest.user ? slackDir(w.role).images.get(latest.user) : undefined,
                text: resolveMentions(latest.text, names),
                ts: latest.ts || '',
                emergency: EMERGENCY_RE.test(latest.text),
                reactions: (latest.reactions ?? []).map((r) => ({ emoji: r.name ?? '', count: r.count ?? 0 })),
                replies: latest.reply_count || undefined,
              });
            }
        }
      } catch (e) {
        wsRec.error = (e as Error).message;
        topErrs.push(`${w.name}: ${(e as Error).message}`);
      }
    }),
  );

  // Unread first, then alphabetical; DMs and channels mixed (the page splits them).
  channels.sort((a, b) => Number(b.hasUnread) - Number(a.hasUnread) || a.name.localeCompare(b.name));
  const data: SlackData = {
    connected: true,
    workspaces,
    channels,
    messages,
    error: channels.length === 0 && topErrs.length ? topErrs.join(' · ') : undefined,
  };
  // Only cache a real result — don't pin a transient all-workspaces-errored read.
  if (channels.length > 0 || messages.length > 0) slackDataCache = { at: Date.now(), data };
  return data;
}

/**
 * One page of full message history for a single conversation. This is the ONLY
 * place that calls conversations.history (Slack's rate-limited method), so the
 * throttle is confined to opening a channel rather than the whole sidebar load.
 * Returns newest-first plus a cursor for older messages.
 */
export async function getSlackHistory(p: { workspace: string; channel: string; cursor?: string; limit?: number }): Promise<SlackHistory> {
  const w = SLACK_WORKSPACES.find((x) => x.role === p.workspace);
  const token = w ? slackReadToken(w) : undefined;
  const base = { workspace: p.workspace, channelId: p.channel };
  if (!w || !token) return { ...base, ok: false, error: 'not_connected', messages: [] };
  try {
    const client = new WebClient(token, SLACK_WC_OPTS);
    const names = await slackNames(w.role, client);
    const images = slackDir(w.role).images;
    const res = await client.conversations.history({
      channel: p.channel,
      limit: p.limit ?? 50,
      ...(p.cursor ? { cursor: p.cursor } : {}),
    });
    const messages = (res.messages ?? [])
      .filter((m) => !m.subtype || m.subtype === 'thread_broadcast')
      .map((m) => ({
        workspace: p.workspace,
        channelId: p.channel,
        channel: '',
        user: (m.user && names.get(m.user)) || m.user || m.username || 'unknown',
        userId: m.user,
        avatar: m.user ? images.get(m.user) : undefined,
        text: resolveMentions(m.text ?? '', names),
        ts: m.ts ?? '',
        emergency: EMERGENCY_RE.test(m.text ?? ''),
        reactions: (m.reactions ?? []).map((r) => ({ emoji: r.name ?? '', count: r.count ?? 0 })),
        replies: m.reply_count || undefined,
      }));
    return { ...base, ok: true, messages, nextCursor: res.response_metadata?.next_cursor || undefined };
  } catch (e) {
    return { ...base, ok: false, error: (e as Error).message, messages: [] };
  }
}

/**
 * Mark a conversation read up to `ts` — the real read-state write a Slack client
 * makes when you open a channel. Needs a user token with the conversation-write
 * scope; best-effort (a missing scope just leaves the unread as-is). Not an
 * outward message, so it isn't gated by Approvals.
 */
export async function markSlackRead(p: { workspace: string; channel: string; ts: string }): Promise<{ ok: boolean; error?: string }> {
  const w = SLACK_WORKSPACES.find((x) => x.role === p.workspace);
  const token = w ? slackReadToken(w) : undefined;
  if (!token || !p.channel || !p.ts) return { ok: false, error: 'not_connected' };
  try {
    const client = new WebClient(token);
    const res = await client.conversations.mark({ channel: p.channel, ts: p.ts });
    return { ok: Boolean(res.ok) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── Trello (REST: API key + token + board) ────────────────────────

function trelloCreds(): { key: string; token: string; board: string } | null {
  const key = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;
  const board = process.env.TRELLO_BOARD_ID;
  return key && token && board ? { key, token, board } : null;
}

export async function getTrello(): Promise<TrelloData> {
  const c = trelloCreds();
  if (!c) return { connected: false, cards: [] };
  try {
    const auth = `key=${c.key}&token=${c.token}`;

    // Best-effort: find the board's "Status" custom field and map its options → text
    // (drives the Website-feed rule: flag only Published / Ready to Publish).
    let statusFieldId: string | null = null;
    const optText = new Map<string, string>();
    try {
      const cf = await fetch(`https://api.trello.com/1/boards/${c.board}/customFields?${auth}`);
      if (cf.ok) {
        const defs = (await cf.json()) as { id: string; name?: string; options?: { id: string; value?: { text?: string } }[] }[];
        const status = defs.find((d) => /status/i.test(d.name ?? ''));
        if (status) {
          statusFieldId = status.id;
          for (const o of status.options ?? []) if (o.value?.text) optText.set(o.id, o.value.text);
        }
      }
    } catch {
      /* custom fields power-up may be off — status stays undefined */
    }

    // `list=true` embeds the card's list; `customFieldItems=true` embeds the Status value.
    const r = await fetch(
      `https://api.trello.com/1/boards/${c.board}/cards?fields=name,url,due,labels&list=true&customFieldItems=true&${auth}`,
    );
    if (!r.ok) return { connected: true, cards: [], error: `Trello API ${r.status}` };
    const j = (await r.json()) as {
      name?: string;
      url?: string;
      due?: string | null;
      labels?: { name?: string }[];
      list?: { name?: string };
      customFieldItems?: { idCustomField: string; idValue?: string }[];
    }[];
    const cards = j.map((c2) => {
      let status: string | undefined;
      if (statusFieldId) {
        const item = (c2.customFieldItems ?? []).find((i) => i.idCustomField === statusFieldId);
        if (item?.idValue) status = optText.get(item.idValue);
      }
      return {
        name: c2.name ?? '(card)',
        url: c2.url ?? '',
        labels: (c2.labels ?? []).map((l) => l.name ?? '').filter(Boolean),
        urgent: Boolean(c2.due && new Date(c2.due).getTime() < Date.now() + 36 * 3600 * 1000),
        due: c2.due ?? null,
        list: c2.list?.name,
        status,
      };
    });
    return { connected: true, cards };
  } catch (e) {
    return { connected: true, cards: [], error: (e as Error).message };
  }
}

// ── Buffer (REST: access token) ───────────────────────────────────

export async function getBuffer(): Promise<BufferData> {
  const token = process.env.BUFFER_ACCESS_TOKEN;
  if (!token) return { connected: false, drafts: 0, scheduled: 0, byPlatform: [] };
  try {
    const r = await fetch(`https://api.bufferapp.com/1/profiles.json?access_token=${token}`);
    if (!r.ok) return { connected: true, drafts: 0, scheduled: 0, byPlatform: [], error: `Buffer API ${r.status}` };
    const profiles = (await r.json()) as { service?: string; counts?: { pending?: number; sent?: number } }[];
    let drafts = 0;
    let scheduled = 0;
    const byPlatform: BufferData['byPlatform'] = [];
    for (const p of profiles) {
      const pending = p.counts?.pending ?? 0;
      scheduled += pending;
      byPlatform.push({ platform: p.service ?? 'channel', count: pending });
    }
    return { connected: true, drafts, scheduled, byPlatform };
  } catch (e) {
    return { connected: true, drafts: 0, scheduled: 0, byPlatform: [], error: (e as Error).message };
  }
}

// ── GitHub (REST: OAuth token) ────────────────────────────────────

export async function getGithub(): Promise<GithubData> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { connected: false, items: [] };
  try {
    const r = await fetch('https://api.github.com/issues?filter=assigned&state=open&per_page=20', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'xani' },
    });
    if (!r.ok) return { connected: true, items: [], error: `GitHub API ${r.status}` };
    const j = (await r.json()) as { title?: string; html_url?: string; pull_request?: unknown; repository?: { full_name?: string } }[];
    const items = (Array.isArray(j) ? j : []).map((i) => ({
      title: i.title ?? '(untitled)',
      repo: i.repository?.full_name ?? '',
      url: i.html_url ?? '',
      isPR: Boolean(i.pull_request),
    }));
    return { connected: true, items };
  } catch (e) {
    return { connected: true, items: [], error: (e as Error).message };
  }
}

// ── Writers: actually perform outward actions (gated by Approvals UI) ──

function base64url(s: string): string {
  return Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sendGmail(p: { to: string; subject: string; body: string; account?: string; threadId?: string; inReplyTo?: string; references?: string }): Promise<ActResult> {
  // Pick the account by role if given, else the first configured one.
  const acct = GMAIL_ACCOUNTS.find((a) => a.role === p.account) ?? GMAIL_ACCOUNTS.find((a) => gmailCreds(a.n));
  const c = acct ? gmailCreds(acct.n) : null;
  if (!c) return { ok: false, note: 'Gmail not connected — add GMAIL_* credentials.' };
  const token = await googleAccessToken(c.id, c.secret, c.refresh);
  if (!token) return { ok: false, error: 'Could not authorise Gmail.' };
  // Extract bare, valid recipient address(es) — refuse to send rather than mail a
  // malformed "To". Supports several comma-separated recipients.
  const to = sanitizeRecipients(p.to);
  if (!to) return { ok: false, error: `No valid recipient address in "${p.to}".` };
  // Neutralise CR/LF in header values (no injected Bcc/etc.) and RFC 2047-encode a
  // non-ASCII subject so Kurdish/Arabic/German subjects arrive intact.
  const subject = encodeSubject(p.subject);
  // Threading headers make the reply land in the original conversation.
  const inReplyTo = sanitizeHeader(p.inReplyTo ?? '');
  const references = sanitizeHeader([p.references, p.inReplyTo].filter(Boolean).join(' ').trim());
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : '',
    references ? `References: ${references}` : '',
    'Content-Type: text/plain; charset="UTF-8"',
  ].filter(Boolean).join('\r\n');
  const raw = base64url(`${headers}\r\n\r\n${p.body}`);
  try {
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(p.threadId ? { raw, threadId: p.threadId } : { raw }),
    });
    if (!r.ok) return { ok: false, error: `Gmail send failed (${r.status}).` };
    const j = (await r.json()) as { id?: string };
    return { ok: true, id: j.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Change a message's Gmail labels (archive / read / star …) — reversible housekeeping. */
async function gmailModify(account: string, id: string, add: string[], remove: string[]): Promise<ActResult> {
  const acct = GMAIL_ACCOUNTS.find((a) => a.role === account);
  const c = acct ? gmailCreds(acct.n) : null;
  if (!c || !id) return { ok: false, note: 'Gmail not connected.' };
  const token = await googleAccessToken(c.id, c.secret, c.refresh);
  if (!token) return { ok: false, error: 'Could not authorise Gmail.' };
  try {
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/modify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }),
    });
    if (!r.ok) return { ok: false, error: `Gmail modify failed (${r.status}).` };
    bumpInboxCache(); // the inbox listing is now stale
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function gmailTrash(account: string, id: string): Promise<ActResult> {
  const acct = GMAIL_ACCOUNTS.find((a) => a.role === account);
  const c = acct ? gmailCreds(acct.n) : null;
  if (!c || !id) return { ok: false, note: 'Gmail not connected.' };
  const token = await googleAccessToken(c.id, c.secret, c.refresh);
  if (!token) return { ok: false, error: 'Could not authorise Gmail.' };
  try {
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/trash`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return { ok: false, error: `Gmail trash failed (${r.status}).` };
    bumpInboxCache();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function createCalendarEvent(p: { title: string; start?: string; end?: string }): Promise<ActResult> {
  const id = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const secret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const refresh = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  if (!id || !secret || !refresh) return { ok: false, note: 'Calendar not connected — add GOOGLE_CALENDAR_* credentials.' };
  const token = await googleAccessToken(id, secret, refresh);
  if (!token) return { ok: false, error: 'Could not authorise Calendar.' };
  const start = p.start ?? new Date(Date.now() + 3600_000).toISOString();
  const end = p.end ?? new Date(new Date(start).getTime() + 3600_000).toISOString();
  try {
    const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: p.title, start: { dateTime: start }, end: { dateTime: end } }),
    });
    if (!r.ok) return { ok: false, error: `Calendar insert failed (${r.status}).` };
    const j = (await r.json()) as { id?: string; htmlLink?: string };
    return { ok: true, id: j.id, url: j.htmlLink };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function postSlack(p: { channel: string; text: string; workspace?: string; threadTs?: string }): Promise<ActResult> {
  // Default to the first connected workspace if none specified.
  const w = (p.workspace ? SLACK_WORKSPACES.find((x) => x.role === p.workspace) : undefined)
    ?? SLACK_WORKSPACES.find((x) => slackPostToken(x));
  const token = w ? slackPostToken(w) : undefined;
  if (!token) return { ok: false, note: 'Slack not connected — add a workspace token on Connections.' };
  try {
    const client = new WebClient(token, SLACK_WC_OPTS);
    const name = p.channel.replace(/^#/, '');
    // A channel/DM id is passed straight through; a #name is resolved to its id.
    let ch = p.channel;
    if (!/^[A-Z0-9]{8,}$/.test(p.channel)) {
      try {
        const list = await client.conversations.list({ types: 'public_channel,private_channel', exclude_archived: true, limit: 200 });
        const found = (list.channels ?? []).find((c) => c.name === name);
        if (found?.id) ch = found.id;
      } catch {
        /* fall back to the raw name */
      }
    }
    const res = await client.chat.postMessage({ channel: ch, text: p.text, ...(p.threadTs ? { thread_ts: p.threadTs } : {}) });
    return res.ok ? { ok: true, id: res.ts } : { ok: false, error: 'Slack post failed.' };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── Slack + mailbox housekeeping (reversible, user-initiated) ──────

function slackClientFor(role?: string, preferUser = false): WebClient | null {
  const w = (role ? SLACK_WORKSPACES.find((x) => x.role === role) : undefined) ?? SLACK_WORKSPACES.find((x) => slackReadToken(x));
  if (!w) return null;
  const token = preferUser ? (slackReadToken(w) ?? slackPostToken(w)) : (slackPostToken(w) ?? slackReadToken(w));
  return token ? new WebClient(token, SLACK_WC_OPTS) : null;
}

async function slackReact(workspace: string, channel: string, ts: string, emoji: string): Promise<ActResult> {
  const client = slackClientFor(workspace);
  if (!client) return { ok: false, note: 'Slack not connected.' };
  try {
    const r = await client.reactions.add({ channel, timestamp: ts, name: emoji.replace(/:/g, '') });
    return r.ok ? { ok: true } : { ok: false, error: 'Slack reaction failed.' };
  } catch (e) {
    const msg = (e as Error).message;
    // Reacting twice is harmless — treat "already_reacted" as success.
    return /already_reacted/.test(msg) ? { ok: true } : { ok: false, error: msg };
  }
}

async function slackMarkRead(workspace: string, channel: string, ts: string): Promise<ActResult> {
  const client = slackClientFor(workspace, true); // conversations.mark needs a user token
  if (!client) return { ok: false, note: 'Slack needs a user token (xoxp-) to mark messages read.' };
  try {
    const r = await client.conversations.mark({ channel, ts });
    return r.ok ? { ok: true } : { ok: false, error: 'Slack mark-read failed.' };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Dispatch a low-stakes mailbox action (archive/read/star/trash/react/mark-read). */
export async function mailboxAction(a: MailboxAction): Promise<ActResult> {
  switch (a.kind) {
    case 'email.archive': return gmailModify(a.account, a.id, [], ['INBOX']);
    case 'email.read': return gmailModify(a.account, a.id, [], ['UNREAD']);
    case 'email.unread': return gmailModify(a.account, a.id, ['UNREAD'], []);
    case 'email.star': return gmailModify(a.account, a.id, ['STARRED'], []);
    case 'email.unstar': return gmailModify(a.account, a.id, [], ['STARRED']);
    case 'email.trash': return gmailTrash(a.account, a.id);
    case 'slack.react': return slackReact(a.workspace, a.channel, a.ts, a.emoji);
    case 'slack.read': return slackMarkRead(a.workspace, a.channel, a.ts);
    default: return { ok: false, error: 'Unsupported mailbox action.' };
  }
}

async function createTrelloCard(p: { name: string; list?: string; due?: string }): Promise<ActResult> {
  const c = trelloCreds();
  if (!c) return { ok: false, note: 'Trello not connected — add TRELLO_API_KEY / TRELLO_TOKEN / TRELLO_BOARD_ID.' };
  const auth = `key=${c.key}&token=${c.token}`;
  try {
    // Find the target list on the board (default to the first list).
    const lr = await fetch(`https://api.trello.com/1/boards/${c.board}/lists?fields=name&${auth}`);
    const lists = lr.ok ? ((await lr.json()) as { id: string; name: string }[]) : [];
    const list = lists.find((l) => p.list && l.name.toLowerCase() === p.list.toLowerCase()) ?? lists[0];
    if (!list) return { ok: false, error: 'No lists on the Trello board.' };
    const params = new URLSearchParams({ idList: list.id, name: p.name, ...(p.due ? { due: p.due } : {}) });
    const r = await fetch(`https://api.trello.com/1/cards?${auth}&${params.toString()}`, { method: 'POST' });
    if (!r.ok) return { ok: false, error: `Trello create failed (${r.status}).` };
    const j = (await r.json()) as { id?: string; shortUrl?: string };
    return { ok: true, id: j.id, url: j.shortUrl };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function createBufferPost(p: { platform: string; caption: string }): Promise<ActResult> {
  const token = process.env.BUFFER_ACCESS_TOKEN;
  if (!token) return { ok: false, note: 'Buffer not connected — add BUFFER_ACCESS_TOKEN.' };
  try {
    const pr = await fetch(`https://api.bufferapp.com/1/profiles.json?access_token=${token}`);
    if (!pr.ok) return { ok: false, error: 'Could not list Buffer channels.' };
    const profiles = (await pr.json()) as { id?: string; service?: string }[];
    const profile = profiles.find((x) => (x.service ?? '').toLowerCase() === p.platform.toLowerCase()) ?? profiles[0];
    if (!profile?.id) return { ok: false, error: 'No matching Buffer channel.' };
    const body = new URLSearchParams({ 'profile_ids[]': profile.id, text: p.caption, access_token: token });
    const r = await fetch('https://api.bufferapp.com/1/updates/create.json', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (!r.ok) return { ok: false, error: `Buffer create failed (${r.status}).` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Dispatch an approved action to the right writer. */
export async function executeAction(payload: ActPayload): Promise<ActResult> {
  switch (payload.kind) {
    case 'email':
      return sendGmail(payload);
    case 'calendar':
      return createCalendarEvent(payload);
    case 'slack':
      return postSlack(payload);
    case 'social':
      return createBufferPost(payload);
    case 'task':
      return createTrelloCard(payload);
    default:
      return { ok: false, error: 'Unsupported action.' };
  }
}

// ── Aggregated morning briefing ───────────────────────────────────

export async function getBriefingData(): Promise<BriefingData> {
  const [gmail, calendar, slack, trello, buffer] = await Promise.all([
    gmailUnreadCounts(),
    getCalendar(),
    getSlack(),
    getTrello(),
    getBuffer(),
  ]);
  return {
    gmail: gmail.accounts,
    trello: trello.cards.map((c) => ({ name: c.name, url: c.url, urgent: c.urgent })),
    buffer: buffer.connected ? { drafts: buffer.drafts, scheduled: buffer.scheduled } : null,
    slack: slack.messages.map((m) => ({ workspace: m.workspace, text: m.text, emergency: m.emergency })),
    calendar: calendar.events.map((e) => ({ title: e.title, start: e.start })),
    connected: {
      gmail: gmail.connected,
      trello: trello.connected,
      buffer: buffer.connected,
      slack: slack.connected,
      calendar: calendar.connected,
    },
  };
}
