import type { TriagedEmail, TriagedSlack, WaitingItem } from '../src/lib/marvin-protocol.ts';

/**
 * Pure assembly of the morning brief's INPUT — the data block handed to the model,
 * and the decision of whether there's anything to brief at all. Kept out of server.ts
 * so it unit-tests without booting the HTTP server (same discipline as cli-stream.ts
 * and deadline.ts).
 *
 * The one rule that matters most here: when nothing needs Rebaz, `empty` is true and
 * the caller makes NO model call — Home shows the calm "you're clear" state instead of
 * inventing urgency (the "empty states only, never mock content" build rule).
 */

export type BriefEvent = { title: string; start: string };
export type BriefCard = { name: string; due?: string | null; urgent?: boolean; list?: string };

export interface BriefInput {
  inboxActs: TriagedEmail[];
  slackActs: TriagedSlack[];
  events: BriefEvent[];
  dueCards: BriefCard[];
  /** Emails he sent that went quiet (silence detection) — awareness, not a new task. */
  waiting?: WaitingItem[];
}

/** How many items of each source the brief data includes — the model sees a focused set,
 *  not an unbounded dump (keeps the prompt small and the brief tight). */
export const BRIEF_ITEM_CAP = 8;

export interface BriefAssembly {
  /** True when nothing needs Rebaz — caller skips the model entirely. */
  empty: boolean;
  /** The source-data block for the model (empty string when `empty`). */
  prompt: string;
}

/** Filter Trello cards down to what actually presses today: urgent, overdue, or due within
 *  ~2 days. A card with a far-future due date is NOT pressing — keeping it (the old
 *  `c.urgent || c.due`) manufactured daily false urgency and defeated the brief's empty-gate. */
export function pressingCards(cards: BriefCard[], now: Date = new Date()): BriefCard[] {
  const soon = now.getTime() + 48 * 60 * 60 * 1000; // overdue (t <= now < soon) or due within 48h
  return cards.filter((c) => {
    if (c.urgent) return true;
    if (!c.due) return false;
    const t = Date.parse(c.due);
    return Number.isFinite(t) && t <= soon;
  });
}

/** Build the model's source-data block from already-triaged act-items + calendar + Trello.
 *  Deterministic and side-effect free. Deadlines (dueAt) are inlined so the model can lead
 *  with the hardest ones. */
export function buildBriefInput(input: BriefInput): BriefAssembly {
  const inboxActs = input.inboxActs.slice(0, BRIEF_ITEM_CAP);
  const slackActs = input.slackActs.slice(0, BRIEF_ITEM_CAP);
  const events = input.events.slice(0, BRIEF_ITEM_CAP);
  const dueCards = input.dueCards.slice(0, BRIEF_ITEM_CAP);
  const waiting = (input.waiting ?? []).slice(0, BRIEF_ITEM_CAP);

  if (inboxActs.length === 0 && slackActs.length === 0 && events.length === 0 && dueCards.length === 0 && waiting.length === 0) {
    return { empty: true, prompt: '' };
  }

  const lines: string[] = [];
  if (inboxActs.length) {
    lines.push(
      'INBOX (needs a reply/decision):\n' +
        inboxActs.map((t) => `- [${t.account}] ${t.from}: ${t.headline || t.subject}${t.dueAt ? ` (due ${t.dueAt})` : ''}`).join('\n'),
    );
  }
  if (slackActs.length) {
    lines.push(
      'SLACK (needs you):\n' +
        slackActs.map((t) => `- [${t.workspaceName}] ${t.dm ? 'DM' : `#${t.channel}`} ${t.from}: ${t.headline || t.text.slice(0, 120)}${t.dueAt ? ` (due ${t.dueAt})` : ''}`).join('\n'),
    );
  }
  if (events.length) {
    lines.push('CALENDAR (today):\n' + events.map((e) => `- ${e.start}: ${e.title}`).join('\n'));
  }
  if (dueCards.length) {
    lines.push('TRELLO (overdue / due today):\n' + dueCards.map((c) => `- ${c.name}${c.due ? ` (due ${c.due})` : ''}${c.list ? ` [${c.list}]` : ''}`).join('\n'));
  }
  if (waiting.length) {
    lines.push('WAITING ON A REPLY (he sent, no answer yet — awareness, not a new task):\n' + waiting.map((w) => `- ${w.to || 'someone'}: ${w.subject} (quiet ${w.quietDays}d)`).join('\n'));
  }

  return { empty: false, prompt: lines.join('\n\n') };
}
