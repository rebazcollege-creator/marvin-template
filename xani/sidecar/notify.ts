/**
 * Notification decision engine — the pure brain behind "when should Xanî interrupt you?".
 *
 * Every proactive signal MARVIN builds (brief, triage, silence detection) only helps if
 * it reaches Rebaz when Home is closed. That's a notification. But a notification is an
 * interruption, and interruptions are the fastest way to make someone with ADHD resent a
 * tool — so the bar is high and the rules are strict:
 *
 *   - Never on a day off (MARVIN initiates NOTHING then — the settled hard constraint).
 *   - Only during waking hours.
 *   - Fire each thing ONCE (stable dedupe key; the caller records what's fired).
 *   - Reserve the interruption for what genuinely can't wait: a Slack emergency, and a
 *     single "your brief is ready" at the start of the day. Everything else waits quietly
 *     on Home.
 *
 * Delivery (the actual OS notification) is a thin platform shim on top; THIS decides what
 * deserves to fire. Pure and side-effect free so it unit-tests without the server, Gmail,
 * or a Mac (same discipline as waiting.ts / brief.ts / deadline.ts).
 */

export interface NotifyEmergency {
  id: string;
  from: string;
  channel: string;
  headline?: string;
  text: string;
}

export interface NotifyInput {
  dayOff: boolean;
  /** Local hour, 0–23. */
  hour: number;
  wakeStart: number;
  wakeEnd: number;
  /** Slack messages triaged 'act' AND flagged emergency — the only auto-interrupt from chat. */
  emergencies: NotifyEmergency[];
  /** Today's morning brief, if one has been generated with real content. */
  brief: { forDate: string; hasContent: boolean } | null;
}

export interface XaniNotification {
  /** Stable dedupe key — the caller records this so the same thing never fires twice. */
  key: string;
  priority: 'high' | 'normal';
  title: string;
  body: string;
}

function firstLine(s: string, max = 140): string {
  const line = (s ?? '').replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/**
 * Decide which notifications should fire right now. Returns only ones NOT already in
 * `fired`; the caller is responsible for recording the returned keys so they don't repeat.
 * High-priority (emergencies) first. `today` is YYYY-MM-DD in Rebaz's timezone.
 */
export function decideNotifications(input: NotifyInput, fired: Iterable<string>, today: string): XaniNotification[] {
  if (input.dayOff) return []; // MARVIN initiates nothing on a day off
  if (input.hour < input.wakeStart || input.hour >= input.wakeEnd) return []; // let the night be quiet

  const already = fired instanceof Set ? fired : new Set(fired);
  const out: XaniNotification[] = [];

  for (const e of input.emergencies) {
    const key = `emergency:${e.id}`;
    if (already.has(key)) continue;
    out.push({
      key,
      priority: 'high',
      title: `🚨 ${e.from}${e.channel ? ` · ${e.channel}` : ''}`,
      body: firstLine(e.headline || e.text),
    });
  }

  if (input.brief && input.brief.hasContent && input.brief.forDate === today) {
    const key = `brief:${today}`;
    if (!already.has(key)) {
      out.push({ key, priority: 'normal', title: 'Your morning brief is ready', body: 'A few things need you today. Open Xanî when you can.' });
    }
  }

  // High priority first; stable otherwise (emergencies keep discovery order).
  return out.sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'high' ? -1 : 1));
}

/**
 * Prune a fired-keys ledger to keep it from growing forever. Keeps date-scoped brief keys
 * for the last few days and all emergency keys within the retained set the caller passes.
 * Returns the keys to keep. (Emergencies are naturally bounded by triage's own windowing.)
 */
export function pruneFiredKeys(fired: Record<string, number>, now: number, keepMs = 3 * 86_400_000): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, at] of Object.entries(fired)) {
    if (typeof at === 'number' && now - at <= keepMs) out[k] = at;
  }
  return out;
}
