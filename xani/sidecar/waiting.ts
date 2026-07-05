import type { WaitingItem } from '../src/lib/marvin-protocol.ts';

/**
 * Silence detection — the pure timing core. Given the metadata of Rebaz's recent sent
 * threads, decide which ones are "still waiting on a reply": the LAST message in the
 * thread is his, and it has sat quiet long enough to be worth a nudge but not so long
 * it's clearly dead.
 *
 * Kept out of server.ts / connectors.ts so it unit-tests without Gmail or the HTTP
 * server (same discipline as cli-stream.ts, deadline.ts, brief.ts). The Gmail fetch and
 * the "did this message actually expect a reply?" model judgement live on top of this;
 * this module only does the deterministic thread arithmetic.
 */

const DAY_MS = 86_400_000;

/** One message in a thread, reduced to what silence detection needs. */
export interface ThreadMsgMeta {
  /** True when Rebaz sent it (Gmail 'SENT' label). */
  fromMe: boolean;
  /** Epoch ms the message was sent/received (Gmail internalDate). */
  internalDate: number;
  /** Recipients (To header) — only meaningful on his own messages. */
  to?: string;
  subject?: string;
  /** Short preview of the message. */
  snippet?: string;
}

/** A sent thread and its messages (order not assumed — sorted here). */
export interface ThreadMeta {
  account: string;
  threadId: string;
  messages: ThreadMsgMeta[];
}

export interface PickAwaitingOpts {
  /** Don't nudge before this many whole days of silence (too soon feels naggy). */
  minQuietDays?: number;
  /** Past this many days, let it go — a nudge would be odd, not helpful. */
  maxAgeDays?: number;
}

export const DEFAULT_WAITING_OPTS: Required<PickAwaitingOpts> = { minQuietDays: 2, maxAgeDays: 21 };

/**
 * From a batch of sent threads, return the ones Rebaz is waiting on, longest-quiet first.
 * A thread qualifies when its most recent message is his and the gap since then is within
 * [minQuietDays, maxAgeDays]. Deterministic and side-effect free; `now` is injected.
 */
export function pickAwaiting(threads: ThreadMeta[], now: number, opts: PickAwaitingOpts = {}): WaitingItem[] {
  const minQuiet = opts.minQuietDays ?? DEFAULT_WAITING_OPTS.minQuietDays;
  const maxAge = opts.maxAgeDays ?? DEFAULT_WAITING_OPTS.maxAgeDays;
  const seen = new Set<string>();
  const items: WaitingItem[] = [];

  for (const t of threads) {
    if (seen.has(t.threadId)) continue; // one nudge per thread, even if the caller passes dupes
    if (!t.messages || t.messages.length === 0) continue;
    const ordered = [...t.messages].sort((a, b) => a.internalDate - b.internalDate);
    const last = ordered[ordered.length - 1];
    if (!last || !last.fromMe) continue; // they already had the last word — nothing to wait on
    const quietDays = Math.floor((now - last.internalDate) / DAY_MS);
    if (quietDays < minQuiet || quietDays > maxAge) continue;
    seen.add(t.threadId);
    items.push({
      account: t.account,
      threadId: t.threadId,
      to: (last.to ?? '').trim(),
      subject: (last.subject ?? '').trim() || '(no subject)',
      snippet: (last.snippet ?? '').trim(),
      sentAt: new Date(last.internalDate).toISOString(),
      quietDays,
    });
  }

  // Longest wait first; stable tiebreak by subject so output is deterministic.
  items.sort((a, b) => b.quietDays - a.quietDays || a.subject.localeCompare(b.subject));
  return items;
}
