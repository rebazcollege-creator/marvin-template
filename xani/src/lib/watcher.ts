import { fetchSlack, fetchInboxFolder } from '@/lib/marvin-data';
import { readJson, writeJson } from '@/lib/storage';
import { pushNotify, notifyEnabled } from '@/lib/notify';

/**
 * The watcher — background freshness so you don't have to keep opening Gmail/Slack.
 *
 * On an interval it re-reads Slack + the inbox and notifies you about NEW things that
 * need you, using only signals available WITHOUT the model:
 *   Slack — a DM with something unread, any message naming "Rebaz", an emergency.
 *   Email — a new unread message Gmail itself marks IMPORTANT.
 *
 * A persisted "seen" set means you're pinged once per item, never for history: the
 * first run seeds silently. Richer, model-based triage still refines the Home lists;
 * this is the always-on nudge layer.
 */

const SEEN_KEY = 'xani.watch.seen.v1';
type Seen = { slack: string[]; email: string[]; seeded: boolean };

function getSeen(): Seen {
  return readJson<Seen>(SEEN_KEY, { slack: [], email: [], seeded: false });
}
function saveSeen(s: Seen): void {
  // Bound the memory — keep the most recent ids.
  writeJson<Seen>(SEEN_KEY, { slack: s.slack.slice(-600), email: s.email.slice(-600), seeded: true });
}

const namesRebaz = (t: string): boolean => /\brebaz\b/i.test(t);
function tidy(t: string): string {
  return (t || '').replace(/\s+/g, ' ').trim();
}

type Ping = { title: string; body: string; tag: string };

/** One watch pass: detect new important Slack + email, notify, update the seen set. */
export async function runWatch(): Promise<void> {
  const s = getSeen();
  const first = !s.seeded; // seed silently on the very first run — don't notify old history
  const pings: Ping[] = [];

  try {
    const sl = await fetchSlack();
    if (sl?.connected) {
      const chan = new Map(sl.channels.map((c) => [c.id, c]));
      for (const m of sl.messages) {
        const ch = chan.get(m.channelId);
        const isDM = ch?.kind === 'dm';
        const flag = m.emergency || (isDM && (ch?.hasUnread ?? false)) || namesRebaz(m.text);
        if (!flag) continue;
        const id = `s:${m.channelId}:${m.ts}`;
        if (s.slack.includes(id)) continue;
        s.slack.push(id);
        if (!first) {
          const where = m.emergency ? `🚨 ${m.workspace} · urgent` : isDM ? `${m.user} · Slack DM` : `#${m.channel} · ${m.workspace}`;
          pings.push({ title: where, body: tidy(m.text) || 'New message', tag: id });
        }
      }
    }
  } catch {
    /* offline / not connected */
  }

  try {
    const inb = await fetchInboxFolder('inbox');
    if (inb?.connected) {
      for (const m of inb.messages) {
        if (!m.unread || m.split !== 'important') continue; // Gmail's own IMPORTANT marker — no model needed
        const id = `e:${m.id}`;
        if (s.email.includes(id)) continue;
        s.email.push(id);
        if (!first) pings.push({ title: `✉️ ${m.from}`, body: tidy(m.subject) || '(no subject)', tag: id });
      }
    }
  } catch {
    /* offline / not connected */
  }

  saveSeen(s);

  if (first || pings.length === 0 || !notifyEnabled()) return;
  if (pings.length <= 4) {
    for (const p of pings) pushNotify(p.title, p.body, { tag: p.tag });
  } else {
    // Avoid a notification storm — one summary instead.
    pushNotify(`${pings.length} new things need you`, 'Open Xanî to go through them.', { tag: 'xani-batch' });
  }
}
