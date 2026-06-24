import { WebClient } from '@slack/web-api';
import type {
  BriefingData,
  InboxData,
  TrelloData,
  CalendarData,
  SlackData,
  BufferData,
  DriveData,
  GithubData,
  ActPayload,
  ActResult,
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

const AMARGI_CHANNELS = [
  { id: 'C0HRYE891', name: 'general' },
  { id: 'C052Z75EY73', name: 'tt-arabic' },
];

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

async function gmailUnreadCounts(): Promise<{ connected: boolean; accounts: { account: string; unread: number }[] }> {
  const accounts: { account: string; unread: number }[] = [];
  let any = false;
  for (const a of GMAIL_ACCOUNTS) {
    const c = gmailCreds(a.n);
    if (!c) continue;
    any = true;
    const token = await googleAccessToken(c.id, c.secret, c.refresh);
    if (!token) continue;
    try {
      const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) continue;
      const j = (await r.json()) as { messagesUnread?: number };
      accounts.push({ account: a.role, unread: j.messagesUnread ?? 0 });
    } catch {
      /* skip */
    }
  }
  return { connected: any, accounts };
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

export async function getInbox(folder = 'inbox'): Promise<InboxData> {
  const cached = inboxCache.get(folder);
  if (cached && cached.ver === inboxCacheVer && Date.now() - cached.ts < INBOX_TTL_MS) return cached.data;

  const q = FOLDER_QUERY[folder] ?? FOLDER_QUERY.inbox;
  const connectedAccounts = GMAIL_ACCOUNTS.map((a) => ({ a, c: gmailCreds(a.n) })).filter((x) => x.c);
  const errs: string[] = [];

  // All accounts in parallel; within each, all per-message metadata gets in parallel
  // (bounded) instead of the previous one-at-a-time await — the N+1 that made the
  // inbox take minutes.
  const perAccount = await Promise.all(
    connectedAccounts.map(async ({ a, c }) => {
      const { token, error } = await googleToken(c!.id, c!.secret, c!.refresh);
      if (!token) {
        errs.push(`${a.role}: ${error ?? 'authentication failed'}`);
        return [] as InboxData['messages'];
      }
      try {
        const list = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=25`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!list.ok) {
          errs.push(`${a.role}: Gmail API ${list.status} — ${(await list.text()).slice(0, 160)}`);
          return [];
        }
        const lj = (await list.json()) as { messages?: { id: string }[] };
        const ids = lj.messages ?? [];
        const rows = await mapPool(ids, 12, async (m) => {
          try {
            const det = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            if (!det.ok) return null;
            const dj = (await det.json()) as {
              snippet?: string;
              internalDate?: string;
              labelIds?: string[];
              payload?: { headers?: { name: string; value: string }[] };
            };
            const header = (name: string) => dj.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? '';
            const labels = dj.labelIds ?? [];
            const subject = header('subject');
            return {
              id: m.id,
              account: a.role,
              from: header('from'),
              subject,
              snippet: dj.snippet ?? '',
              receivedAt: dj.internalDate ? new Date(Number(dj.internalDate)).toISOString() : '',
              unread: labels.includes('UNREAD'),
              split: splitFor(labels, subject),
            } as InboxData['messages'][number];
          } catch {
            return null;
          }
        });
        return rows.filter((r): r is InboxData['messages'][number] => r != null);
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
  const data: InboxData = { connected: connectedAccounts.length > 0, messages, error };
  inboxCache.set(folder, { ts: Date.now(), ver: inboxCacheVer, data });
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

/** Walk a Gmail payload tree, preferring text/plain; fall back to stripped HTML. */
function extractBody(payload: unknown): string {
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
  if (plains.length) return plains.join('\n').trim();
  if (htmls.length) {
    return htmls
      .join('\n')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
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
  return '';
}

/** Full body of a single message, for the reading pane. Cred-gated per account. */
export async function getMessageBody(accountRole: string, id: string): Promise<{ ok: boolean; body?: string; error?: string }> {
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
    const j = (await r.json()) as { payload?: unknown; snippet?: string };
    const body = extractBody(j.payload) || (j.snippet ?? '');
    return { ok: true, body };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
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
    if (!r.ok) return { connected: true, events: [] };
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
  } catch {
    return { connected: true, events: [] };
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
    if (!r.ok) return { connected: true, files: [] };
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
  } catch {
    return { connected: true, files: [] };
  }
}

// ── Slack (read-only) ─────────────────────────────────────────────

export async function getSlack(): Promise<SlackData> {
  const token = process.env.SLACK_AMARGI_BOT_TOKEN;
  if (!token) return { connected: false, messages: [] };
  const client = new WebClient(token);
  const out: SlackData['messages'] = [];
  for (const ch of AMARGI_CHANNELS) {
    try {
      const res = await client.conversations.history({ channel: ch.id, limit: 8 });
      for (const m of res.messages ?? []) {
        out.push({
          workspace: 'amargi',
          channel: ch.name,
          user: m.user ?? '',
          text: m.text ?? '',
          ts: m.ts ?? '',
          emergency: false,
        });
      }
    } catch {
      /* skip channel */
    }
  }
  return { connected: true, messages: out };
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
    const r = await fetch(`https://api.trello.com/1/boards/${c.board}/cards?fields=name,url,due,labels&${auth}`);
    if (!r.ok) return { connected: true, cards: [] };
    const j = (await r.json()) as { name?: string; url?: string; due?: string | null; labels?: { name?: string }[] }[];
    const cards = j.map((c2) => ({
      name: c2.name ?? '(card)',
      url: c2.url ?? '',
      labels: (c2.labels ?? []).map((l) => l.name ?? '').filter(Boolean),
      urgent: Boolean(c2.due && new Date(c2.due).getTime() < Date.now() + 36 * 3600 * 1000),
      due: c2.due ?? null,
    }));
    return { connected: true, cards };
  } catch {
    return { connected: true, cards: [] };
  }
}

// ── Buffer (REST: access token) ───────────────────────────────────

export async function getBuffer(): Promise<BufferData> {
  const token = process.env.BUFFER_ACCESS_TOKEN;
  if (!token) return { connected: false, drafts: 0, scheduled: 0, byPlatform: [] };
  try {
    const r = await fetch(`https://api.bufferapp.com/1/profiles.json?access_token=${token}`);
    if (!r.ok) return { connected: true, drafts: 0, scheduled: 0, byPlatform: [] };
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
  } catch {
    return { connected: true, drafts: 0, scheduled: 0, byPlatform: [] };
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
    if (!r.ok) return { connected: true, items: [] };
    const j = (await r.json()) as { title?: string; html_url?: string; pull_request?: unknown; repository?: { full_name?: string } }[];
    const items = (Array.isArray(j) ? j : []).map((i) => ({
      title: i.title ?? '(untitled)',
      repo: i.repository?.full_name ?? '',
      url: i.html_url ?? '',
      isPR: Boolean(i.pull_request),
    }));
    return { connected: true, items };
  } catch {
    return { connected: true, items: [] };
  }
}

// ── Writers: actually perform outward actions (gated by Approvals UI) ──

function base64url(s: string): string {
  return Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sendGmail(p: { to: string; subject: string; body: string; account?: string }): Promise<ActResult> {
  // Pick the account by role if given, else the first configured one.
  const acct = GMAIL_ACCOUNTS.find((a) => a.role === p.account) ?? GMAIL_ACCOUNTS.find((a) => gmailCreds(a.n));
  const c = acct ? gmailCreds(acct.n) : null;
  if (!c) return { ok: false, note: 'Gmail not connected — add GMAIL_* credentials.' };
  const token = await googleAccessToken(c.id, c.secret, c.refresh);
  if (!token) return { ok: false, error: 'Could not authorise Gmail.' };
  const raw = base64url(`To: ${p.to}\r\nSubject: ${p.subject}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${p.body}`);
  try {
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    if (!r.ok) return { ok: false, error: `Gmail send failed (${r.status}).` };
    const j = (await r.json()) as { id?: string };
    return { ok: true, id: j.id };
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

async function postSlack(p: { channel: string; text: string }): Promise<ActResult> {
  const token = process.env.SLACK_AMARGI_BOT_TOKEN;
  if (!token) return { ok: false, note: 'Slack not connected — add SLACK_AMARGI_BOT_TOKEN.' };
  try {
    const client = new WebClient(token);
    const name = p.channel.replace(/^#/, '');
    const ch = AMARGI_CHANNELS.find((c) => c.name === name)?.id ?? name;
    const res = await client.chat.postMessage({ channel: ch, text: p.text });
    return res.ok ? { ok: true, id: res.ts } : { ok: false, error: 'Slack post failed.' };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
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
