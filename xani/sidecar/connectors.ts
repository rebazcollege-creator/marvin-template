import { WebClient } from '@slack/web-api';
import type {
  BriefingData,
  InboxData,
  TrelloData,
  CalendarData,
  SlackData,
  BufferData,
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
 *   - Slack: real via @slack/web-api (bot token), read-only. LeadStories Slack is
 *     monitor-only and must never be written to.
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
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { access_token?: string };
    return j.access_token ?? null;
  } catch {
    return null;
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

export async function getInbox(): Promise<InboxData> {
  const messages: InboxData['messages'] = [];
  let any = false;
  for (const a of GMAIL_ACCOUNTS) {
    const c = gmailCreds(a.n);
    if (!c) continue;
    any = true;
    const token = await googleAccessToken(c.id, c.secret, c.refresh);
    if (!token) continue;
    try {
      const list = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=6',
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!list.ok) continue;
      const lj = (await list.json()) as { messages?: { id: string }[] };
      for (const m of lj.messages ?? []) {
        const det = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!det.ok) continue;
        const dj = (await det.json()) as {
          snippet?: string;
          internalDate?: string;
          payload?: { headers?: { name: string; value: string }[] };
        };
        const header = (name: string) =>
          dj.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? '';
        messages.push({
          account: a.role,
          from: header('from'),
          subject: header('subject'),
          snippet: dj.snippet ?? '',
          receivedAt: dj.internalDate ? new Date(Number(dj.internalDate)).toISOString() : '',
          unread: true,
        });
      }
    } catch {
      /* skip account */
    }
  }
  return { connected: any, messages };
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

// ── Trello (Zapier MCP — pending) ─────────────────────────────────

export function getTrello(): TrelloData {
  return { connected: false, cards: [] };
}

// ── Buffer (Direct MCP — pending) ─────────────────────────────────

export function getBuffer(): BufferData {
  return { connected: false, drafts: 0, scheduled: 0, byPlatform: [] };
}

// ── Aggregated morning briefing ───────────────────────────────────

export async function getBriefingData(): Promise<BriefingData> {
  const [gmail, calendar, slack] = await Promise.all([gmailUnreadCounts(), getCalendar(), getSlack()]);
  const trello = getTrello();
  const buffer = getBuffer();
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
