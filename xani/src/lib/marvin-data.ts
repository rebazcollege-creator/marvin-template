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
} from '@/lib/marvin-protocol';

/**
 * Read-only data the renderer pulls from the sidecar (which owns the tokens and
 * makes the real Gmail/Calendar/Slack/Trello/Buffer calls). Returns null if the
 * sidecar is unreachable so the UI can fall back to a clean empty state.
 *
 * Stale-while-revalidate cache: successful responses are cached in memory keyed by
 * path, and identical concurrent requests are de-duplicated into a single fetch.
 * Components read the last-known value synchronously via peekData() to paint
 * instantly on revisit, then this revalidates in the background. (Cache lives for
 * the session; navigating away and back is instant, and the LivePreview poll +
 * a screen share one request.)
 */

const SIDECAR_URL = process.env.NEXT_PUBLIC_MARVIN_SIDECAR_URL ?? 'http://localhost:8787';

type Entry = { data: unknown; ts: number };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

// Persist a few high-value, small payloads to localStorage so the screen paints
// last-session data INSTANTLY on app relaunch (then revalidates in the background).
// Scoped to inbox + briefing; cleared on disconnect with the in-memory cache.
const PERSIST_PREFIXES = ['/data/inbox', '/data/briefing'];
const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;
const persistKey = (path: string) => `xani:dc:${path}`;
const shouldPersist = (path: string) => PERSIST_PREFIXES.some((p) => path.startsWith(p));

function persist(path: string, data: unknown, ts: number): void {
  if (typeof window === 'undefined' || !shouldPersist(path)) return;
  try {
    window.localStorage.setItem(persistKey(path), JSON.stringify({ data, ts }));
  } catch {
    /* quota or disabled storage — fine, in-memory cache still works */
  }
}

function dropPersisted(predicate: (path: string) => boolean): void {
  if (typeof window === 'undefined') return;
  try {
    for (const k of Object.keys(window.localStorage)) {
      if (k.startsWith('xani:dc:') && predicate(k.slice('xani:dc:'.length))) window.localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

/** Last-known cached value for a path, read synchronously. Falls back to the
 *  persisted (localStorage) copy on a cold start so the UI paints immediately. */
export function peekData<T>(path: string): T | null {
  const e = cache.get(path);
  if (e) return e.data as T;
  if (typeof window === 'undefined' || !shouldPersist(path)) return null;
  try {
    const raw = window.localStorage.getItem(persistKey(path));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: unknown; ts: number };
    if (Date.now() - parsed.ts > PERSIST_MAX_AGE) return null;
    cache.set(path, { data: parsed.data, ts: parsed.ts });
    return parsed.data as T;
  } catch {
    return null;
  }
}

/** Age in ms of the cached value for a path (Infinity if absent). */
export function dataAge(path: string): number {
  const e = cache.get(path);
  return e ? Date.now() - e.ts : Infinity;
}

/** Drop the cached + in-flight entry for one exact path, so the next fetch hits the
 *  network. Used by the manual refresh button on each screen. */
export function invalidate(path: string): void {
  cache.delete(path);
  inflight.delete(path);
  dropPersisted((p) => p === path);
}

/** Drop cached entries whose path starts with `prefix` (or all). Used on disconnect
 *  so a removed account's mail can't linger in the UI. */
export function clearDataCache(prefix?: string): void {
  if (!prefix) {
    cache.clear();
    dropPersisted(() => true);
    return;
  }
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
  dropPersisted((p) => p.startsWith(prefix));
}

async function get<T>(path: string): Promise<T | null> {
  const existing = inflight.get(path);
  if (existing) return existing as Promise<T | null>;

  const req = (async () => {
    try {
      const resp = await fetch(`${SIDECAR_URL}${path}`);
      if (!resp.ok) return null;
      const data = (await resp.json()) as T;
      const ts = Date.now();
      cache.set(path, { data, ts });
      persist(path, data, ts);
      return data;
    } catch {
      return null;
    } finally {
      inflight.delete(path);
    }
  })();

  inflight.set(path, req);
  return req as Promise<T | null>;
}

export const PATHS = {
  briefing: '/data/briefing',
  inbox: '/data/inbox',
  trello: '/data/trello',
  calendar: '/data/calendar',
  drive: '/data/drive',
  slack: '/data/slack',
  buffer: '/data/buffer',
  github: '/data/github',
} as const;

export const fetchBriefingData = () => get<BriefingData>(PATHS.briefing);
export const fetchInbox = () => get<InboxData>(PATHS.inbox);
/** Per-folder inbox fetch (Inbox/Starred/Sent/Drafts/Spam/Trash). Pass a `cursor`
 *  from a previous response to load the next page of older history. */
export const fetchInboxFolder = (folder: string, cursor?: string) =>
  get<InboxData>(`${PATHS.inbox}?folder=${encodeURIComponent(folder)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
/** Full body of one message, for the reading pane (real HTML + plain-text fallback).
 *  Email bodies are immutable, so a successful fetch is cached for the session — this
 *  makes hover-prefetch effective and reopening a message instant. */
type MessageBody = {
  ok: boolean; html?: string; text?: string; body?: string; error?: string;
  /** Reply threading context. */
  threadId?: string; messageId?: string; references?: string; subject?: string; from?: string; to?: string;
};
const bodyCache = new Map<string, MessageBody>();
const bodyInflight = new Map<string, Promise<MessageBody | null>>();
export async function fetchMessageBody(account: string, id: string): Promise<MessageBody | null> {
  const key = `${account}:${id}`;
  const hit = bodyCache.get(key);
  if (hit) return hit;
  const pending = bodyInflight.get(key);
  if (pending) return pending;
  const req = (async () => {
    try {
      const resp = await fetch(`${SIDECAR_URL}/data/message?account=${encodeURIComponent(account)}&id=${encodeURIComponent(id)}`);
      if (!resp.ok) return null;
      const r = (await resp.json()) as MessageBody;
      if (r.ok) bodyCache.set(key, r);
      return r;
    } catch {
      return null;
    } finally {
      bodyInflight.delete(key);
    }
  })();
  bodyInflight.set(key, req);
  return req;
}
/** Ask the runtime to draft a reply (Haiku). Returns the draft body text. POST, uncached. */
export async function draftReply(p: { account: string; from: string; subject: string; body: string; medium?: 'email' | 'slack'; voice?: string }): Promise<string | null> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/draft-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    });
    if (!resp.ok) return null;
    const j = (await resp.json()) as { ok: boolean; draft?: string };
    return j.ok ? j.draft ?? '' : null;
  } catch {
    return null;
  }
}

/** Ask the runtime to summarise a Slack channel/thread (Haiku). POST, uncached. */
export async function summarizeThread(p: { title: string; text: string }): Promise<string | null> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    });
    if (!resp.ok) return null;
    const j = (await resp.json()) as { ok: boolean; summary?: string };
    return j.ok ? j.summary ?? '' : null;
  } catch {
    return null;
  }
}
export const fetchTrello = () => get<TrelloData>(PATHS.trello);
export const fetchCalendar = () => get<CalendarData>(PATHS.calendar);
export const fetchDrive = () => get<DriveData>(PATHS.drive);
export const fetchSlack = () => get<SlackData>(PATHS.slack);
/** On-demand full history for one Slack conversation (paginated via cursor). */
export async function fetchSlackHistory(p: { workspace: string; channel: string; cursor?: string; limit?: number }): Promise<SlackHistory | null> {
  try {
    const q = new URLSearchParams({ workspace: p.workspace, channel: p.channel });
    if (p.cursor) q.set('cursor', p.cursor);
    if (p.limit) q.set('limit', String(p.limit));
    const resp = await fetch(`${SIDECAR_URL}/data/slack/history?${q}`);
    if (!resp.ok) return null;
    return (await resp.json()) as SlackHistory;
  } catch {
    return null;
  }
}
export const fetchBuffer = () => get<BufferData>(PATHS.buffer);
export const fetchGithub = () => get<GithubData>(PATHS.github);
