import { fetchTrello } from '@/lib/marvin-data';
import { upsertLoop } from '@/lib/open-loops';

/**
 * Open Loops monitor — turns live source data into tracked commitments, applying
 * Rebaz's flagging rules (docs/triage-rules.md). Idempotent: re-running upserts by
 * source+ref, never duplicates, and never re-opens a loop Rebaz has completed.
 *
 * Trello (Social Media board):
 *   Review · Planning · Video feed  → flag ALL cards
 *   Website feed                    → flag ONLY when Status = Published / Ready to Publish
 *
 * Slack is NOT auto-captured here. Like email, it goes through a review step on the
 * Home page ("From Slack — needs you", fed by /triage/slack) so Rebaz taps "Track it"
 * — nothing lands in Open Loops without his nod ("Prepare, I approve").
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
}
