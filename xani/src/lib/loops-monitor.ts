import { fetchTrello, fetchSlack } from '@/lib/marvin-data';
import { upsertLoop } from '@/lib/open-loops';

/**
 * Open Loops monitor — turns live source data into tracked commitments, applying
 * Rebaz's flagging rules (docs/triage-rules.md). Idempotent: re-running upserts by
 * source+ref, never duplicates, and never re-opens a loop Rebaz has completed.
 *
 * Trello (Social Media board):
 *   Review · Planning · Video feed  → flag ALL cards
 *   Website feed                    → flag ONLY when Status = Published / Ready to Publish
 * Slack:
 *   DMs with something unread        → flag (Amargi + LeadStories DMs are always asks)
 *   Any message naming "Rebaz"       → flag
 *   Emergency trend-drops            → flag (URGENT)
 */

const FLAG_LISTS = ['review', 'planning', 'video feed', 'video'];
const WEBSITE_LISTS = ['website feed', 'website'];
const WEBSITE_STATUS_OK = ['published', 'ready to publish'];

function trelloShouldFlag(list: string, status: string): boolean {
  const l = list.toLowerCase();
  const s = status.toLowerCase();
  if (FLAG_LISTS.some((x) => l.includes(x))) return true;
  if (WEBSITE_LISTS.some((x) => l.includes(x))) return WEBSITE_STATUS_OK.some((x) => s.includes(x));
  return false;
}

/** Make Slack message text readable: <@U123|Name> → @Name, <url|label> → label. */
function cleanSlack(text: string): string {
  return text
    .replace(/<@[A-Z0-9]+\|([^>]+)>/g, '@$1')
    .replace(/<@[A-Z0-9]+>/g, '@someone')
    .replace(/<(?:https?:)?\/?\/?[^|>]+\|([^>]+)>/g, '$1')
    .replace(/<(https?:\/\/[^>]+)>/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sync commitments from all connected sources into the Open Loops store. Safe to call
 *  often — no-ops when the runtime is offline or a source isn't connected. */
export async function syncOpenLoops(): Promise<void> {
  // Trello
  try {
    const t = await fetchTrello();
    if (t?.connected) {
      for (const card of t.cards) {
        if (!trelloShouldFlag(card.list ?? '', card.status ?? '')) continue;
        upsertLoop({
          source: 'trello',
          channel: `Trello · ${card.list ?? 'Card'}`,
          task: card.name,
          dueAt: card.due ?? undefined,
          ref: card.url,
          saidOk: false,
        });
      }
    }
  } catch {
    /* offline / no creds */
  }

  // Slack — DMs, name-mentions, emergencies (draft-and-approve, per triage-rules §2)
  try {
    const s = await fetchSlack();
    if (s?.connected) {
      const chanById = new Map(s.channels.map((c) => [c.id, c]));
      for (const m of s.messages) {
        const ch = chanById.get(m.channelId);
        const isDM = ch?.kind === 'dm';
        const nameMention = /\brebaz\b/i.test(m.text);
        const flag = m.emergency || (isDM && (ch?.hasUnread ?? false)) || nameMention;
        if (!flag) continue;
        const text = cleanSlack(m.text);
        if (!text) continue;
        const where = isDM ? `${m.workspace} · Slack DM` : `${m.workspace} · #${m.channel}`;
        upsertLoop({
          source: 'slack',
          channel: m.emergency ? `${where} · URGENT` : where,
          from: m.user,
          task: text.length > 180 ? `${text.slice(0, 177)}…` : text,
          ref: `${m.channelId}:${m.ts}`,
          saidOk: false,
          slack: { workspace: m.workspace, channelId: m.channelId, channel: m.channel, from: m.user, text },
        });
      }
    }
  } catch {
    /* offline / no creds */
  }
}
