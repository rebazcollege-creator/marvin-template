import type {
  BriefingData,
  InboxData,
  TrelloData,
  CalendarData,
  SlackData,
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

/** Last-known cached value for a path, read synchronously (null if never fetched). */
export function peekData<T>(path: string): T | null {
  const e = cache.get(path);
  return e ? (e.data as T) : null;
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
}

/** Drop cached entries whose path starts with `prefix` (or all). Used on disconnect
 *  so a removed account's mail can't linger in the UI. */
export function clearDataCache(prefix?: string): void {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
}

async function get<T>(path: string): Promise<T | null> {
  const existing = inflight.get(path);
  if (existing) return existing as Promise<T | null>;

  const req = (async () => {
    try {
      const resp = await fetch(`${SIDECAR_URL}${path}`);
      if (!resp.ok) return null;
      const data = (await resp.json()) as T;
      cache.set(path, { data, ts: Date.now() });
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
/** Per-folder inbox fetch (Inbox/Starred/Sent/Drafts/Spam/Trash). */
export const fetchInboxFolder = (folder: string) => get<InboxData>(`${PATHS.inbox}?folder=${encodeURIComponent(folder)}`);
/** Full body of one message, for the reading pane (real HTML + plain-text fallback). */
export const fetchMessageBody = (account: string, id: string) =>
  get<{ ok: boolean; html?: string; text?: string; body?: string; error?: string }>(
    `/data/message?account=${encodeURIComponent(account)}&id=${encodeURIComponent(id)}`,
  );
/** Ask the runtime to draft a reply (Haiku). Returns the draft body text. POST, uncached. */
export async function draftReply(p: { account: string; from: string; subject: string; body: string }): Promise<string | null> {
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
export const fetchTrello = () => get<TrelloData>(PATHS.trello);
export const fetchCalendar = () => get<CalendarData>(PATHS.calendar);
export const fetchDrive = () => get<DriveData>(PATHS.drive);
export const fetchSlack = () => get<SlackData>(PATHS.slack);
export const fetchBuffer = () => get<BufferData>(PATHS.buffer);
export const fetchGithub = () => get<GithubData>(PATHS.github);
