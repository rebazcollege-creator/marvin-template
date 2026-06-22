import type { BriefingData } from '../src/lib/marvin-protocol.ts';

/**
 * Integration connectors (sidecar side) — "ready but stubbed".
 *
 * All run in the sidecar so tokens never reach the renderer. Each is cred-gated:
 * with no credentials it reports connected:false and returns nothing (the
 * no-mock-data rule); with credentials it performs the real call.
 *
 * Mechanisms follow the settled architecture:
 *   - Gmail (5 accounts) + Google Calendar: real REST via OAuth refresh tokens.
 *   - Trello: Zapier MCP (pending MCP wiring) — gated, reports not-connected.
 *   - Buffer: Direct MCP (pending MCP wiring) — gated, reports not-connected.
 *   - Slack: token-gated; live mention fetch needs search scopes (pending).
 *     LeadStories Slack is monitor-only and must never be written to.
 */

const GMAIL_ACCOUNTS = [
  { role: 'personal', n: 1 },
  { role: 'moonshot', n: 2 },
  { role: 'leadstories', n: 3 },
  { role: 'zoho', n: 4 },
  { role: 'amargi', n: 5 },
] as const;

async function googleAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string | null> {
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

async function gmailUnread(): Promise<{ connected: boolean; accounts: { account: string; unread: number }[] }> {
  const accounts: { account: string; unread: number }[] = [];
  let anyConfigured = false;
  for (const a of GMAIL_ACCOUNTS) {
    const id = process.env[`GMAIL_CLIENT_ID_${a.n}`];
    const secret = process.env[`GMAIL_CLIENT_SECRET_${a.n}`];
    const refresh = process.env[`GMAIL_REFRESH_TOKEN_${a.n}`];
    if (!id || !secret || !refresh) continue;
    anyConfigured = true;
    const token = await googleAccessToken(id, secret, refresh);
    if (!token) continue;
    try {
      const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) continue;
      const j = (await r.json()) as { messagesUnread?: number };
      accounts.push({ account: a.role, unread: j.messagesUnread ?? 0 });
    } catch {
      /* skip this account on error */
    }
  }
  return { connected: anyConfigured, accounts };
}

async function calendarToday(): Promise<{ connected: boolean; events: { title: string; start: string }[] }> {
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
      items?: { summary?: string; start?: { dateTime?: string; date?: string } }[];
    };
    const events = (j.items ?? []).map((e) => ({
      title: e.summary ?? '(busy)',
      start: e.start?.dateTime ?? e.start?.date ?? '',
    }));
    return { connected: true, events };
  } catch {
    return { connected: true, events: [] };
  }
}

function slackMentions(): { connected: boolean; mentions: { workspace: string; text: string; emergency: boolean }[] } {
  // Token-gated. Live mention fetch needs search scopes / event subscriptions;
  // wired in a later pass. LeadStories Slack stays read/monitor-only.
  const configured = Boolean(
    process.env.SLACK_LEADSTORIES_BOT_TOKEN || process.env.SLACK_AMARGI_BOT_TOKEN,
  );
  return { connected: configured, mentions: [] };
}

function trelloStatus(): { connected: boolean; cards: { name: string; url: string; urgent: boolean }[] } {
  // Trello is via Zapier MCP (board 683dafe308be04e369b8434c) — pending MCP wiring.
  return { connected: false, cards: [] };
}

function bufferStatus(): { connected: boolean; status: { drafts: number; scheduled: number } | null } {
  // Buffer is via Direct MCP (org 68d1dabf16b86596e286a44b) — pending MCP wiring.
  return { connected: false, status: null };
}

/** Aggregate all sources for the morning briefing (parallel where async). */
export async function getBriefingData(): Promise<BriefingData> {
  const [gmail, calendar] = await Promise.all([gmailUnread(), calendarToday()]);
  const slack = slackMentions();
  const trello = trelloStatus();
  const buffer = bufferStatus();
  return {
    gmail: gmail.accounts,
    trello: trello.cards,
    buffer: buffer.status,
    slack: slack.mentions,
    calendar: calendar.events,
    connected: {
      gmail: gmail.connected,
      trello: trello.connected,
      buffer: buffer.connected,
      slack: slack.connected,
      calendar: calendar.connected,
    },
  };
}
