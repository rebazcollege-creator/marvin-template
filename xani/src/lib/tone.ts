import type { OpenLoop } from '@/lib/open-loops';

/**
 * Tone — the compassion layer (ADHD design report §5). One place that owns how Xanî
 * talks about time, backlog, and priority, so nothing in the UI can shame or nag.
 *
 * Hard rules baked in here:
 *   - NEVER the word "overdue", never a red failure count, never "you're late".
 *   - Time is an invitation, not a deadline whip.
 *   - A missed thing is "when you can", not a mark against you.
 */

/** Minutes from now until an ISO time (negative = past). */
export function minsUntil(iso: string, now: Date = new Date()): number {
  return Math.round((Date.parse(iso) - now.getTime()) / 60000);
}

/** "When" — a compact relative time from an epoch-ms instant ("just now", "12m ago",
 *  "3h ago", "yesterday", "4d ago", then an absolute date). So nothing looks new when it's not. */
export function timeAgo(ms: number, now: Date = new Date()): string {
  if (!ms || Number.isNaN(ms)) return '';
  const diff = now.getTime() - ms;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Slack ts ("1690000000.0001") → epoch ms. */
export function slackTsMs(ts: string): number {
  const n = Number(ts);
  return Number.isFinite(n) ? Math.round(n * 1000) : 0;
}

/** The exact wall-clock date+time of an instant, in the user's timezone — so a relative
 *  "13h ago" can always be checked against the real send date ("1 Jul, 22:04"). */
export function whenExact(ms: number, tz?: string): string {
  if (!ms || Number.isNaN(ms)) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(ms));
}

/** True when an instant is within the last `days` — used to stop stale items looking new. */
export function isRecent(ms: number, days = 4, now: Date = new Date()): boolean {
  return ms > 0 && now.getTime() - ms <= days * 86_400_000;
}

/** Human duration for an estimate ("~4 min", "~1h 20m"). */
export function estLabel(mins: number): string {
  const m = Math.max(1, Math.round(mins));
  if (m < 60) return `~${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `~${h}h ${r}m` : `~${h}h`;
}

/**
 * How we talk about a due time — warm, never shaming. Something in the past is not
 * "overdue"; it's simply "when you can", optionally softened with how long it's waited.
 */
export function dueLabel(dueAt: string | undefined, now: Date = new Date()): string | null {
  if (!dueAt) return null;
  const m = minsUntil(dueAt, now);
  if (m >= 0) {
    if (m < 60) return `good to do in ${m} min`;
    const h = Math.round(m / 60);
    return h < 24 ? `there’s time — about ${h}h` : 'no rush';
  }
  // Past: gentle, never a red flag.
  const waited = -m;
  if (waited < 60 * 24) return 'ready when you are';
  const days = Math.round(waited / (60 * 24));
  return days <= 1 ? 'been waiting since yesterday — no pressure' : `been waiting a while — pick it up when you can`;
}

/**
 * One warm line explaining why THIS is the one thing now — kills prioritization
 * paralysis by making the choice feel obvious and reasoned, not arbitrary.
 */
export function whyThisOne(loop: OpenLoop, now: Date = new Date()): string {
  if (loop.dueAt) {
    const m = minsUntil(loop.dueAt, now);
    if (m >= 0 && m < 120) return 'It’s the most time-sensitive right now.';
    if (m < 0) return 'It’s been waiting the longest — let’s close it gently.';
  }
  if (loop.saidOk) return 'You already said yes to this one — let’s make it true.';
  if (loop.from) return `${loop.from} is waiting on you — a quick reply frees it up.`;
  if (loop.source === 'manual') return 'You flagged this yourself — worth clearing.';
  return 'A small win to start the momentum.';
}

/** A gentle count phrase — never a bare red number of "failures". */
export function gentleCount(n: number, kind = 'thing'): string {
  if (n <= 0) return `no ${kind}s waiting`;
  if (n === 1) return `1 ${kind}, whenever you’re ready`;
  return `${n} ${kind}s — no rush`;
}
