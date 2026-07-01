import { readJson, writeJson, newId } from '@/lib/storage';
import { logActivity } from '@/lib/activity';

/**
 * Open Loops — the working-memory store (the ADHD core, foundations.md §1).
 *
 * Every commitment directed at Rebaz becomes a tracked loop and stays visible
 * until it is genuinely done. "Acknowledged" (he said ok) is NOT done — the loop
 * keeps holding until completed or snoozed. The Phase-6 monitor auto-captures
 * from Slack DMs/@mentions and Trello card-comment mentions; today loops can be
 * captured manually (brain-dump). No mock data — the list starts empty.
 *
 * Same local-store contract as approvals.ts (storage adapter + change event).
 */

function broadcast(): void {
  try {
    window.dispatchEvent(new CustomEvent('xani:loops-changed'));
  } catch {
    /* SSR / no window */
  }
}

export type LoopSource = 'slack' | 'trello' | 'email' | 'manual';
export type LoopStatus = 'open' | 'done' | 'snoozed';

export type OpenLoop = {
  id: string;
  source: LoopSource;
  /** Human label for the origin, e.g. "Amargi · Slack DM" or "Trello · Review". */
  channel?: string;
  /** Who asked. */
  from?: string;
  /** The commitment / request itself. */
  task: string;
  status: LoopStatus;
  /** True once Rebaz has replied "ok" but not yet delivered — the dangerous state. */
  saidOk: boolean;
  createdAt: string;
  /** Optional deadline (ISO) — drives time-visibility. */
  dueAt?: string;
  snoozedUntil?: string;
  /** Back-link to the source (thread ts / card url) for the monitor. */
  ref?: string;
  /** For email loops: enough context to draft a reply (the next step after tracking). */
  email?: { account: string; id: string; from: string; subject: string };
};

const KEY = 'xani.openloops.v1';

export function listLoops(): OpenLoop[] {
  return readJson<OpenLoop[]>(KEY, []);
}
function save(list: OpenLoop[]): void {
  writeJson(KEY, list);
  broadcast();
}

/** Loops that still need Rebaz — hides snoozed-until-later and done. */
export function activeLoops(now: Date = new Date()): OpenLoop[] {
  const t = now.getTime();
  return listLoops()
    .filter((l) => l.status === 'open' || (l.status === 'snoozed' && l.snoozedUntil && Date.parse(l.snoozedUntil) <= t))
    .sort((a, b) => {
      // nearest due first, then oldest — so "one thing" is the most time-critical
      const ad = a.dueAt ? Date.parse(a.dueAt) : Infinity;
      const bd = b.dueAt ? Date.parse(b.dueAt) : Infinity;
      if (ad !== bd) return ad - bd;
      return Date.parse(a.createdAt) - Date.parse(b.createdAt);
    });
}

export function captureLoop(input: {
  source?: LoopSource;
  channel?: string;
  from?: string;
  task: string;
  dueAt?: string;
  ref?: string;
  saidOk?: boolean;
  email?: { account: string; id: string; from: string; subject: string };
}): OpenLoop {
  const loop: OpenLoop = {
    id: newId(),
    source: input.source ?? 'manual',
    channel: input.channel,
    from: input.from,
    task: input.task,
    status: 'open',
    saidOk: input.saidOk ?? false,
    createdAt: new Date().toISOString(),
    dueAt: input.dueAt,
    ref: input.ref,
    email: input.email,
  };
  save([loop, ...listLoops()]);
  logActivity({ kind: 'note', title: 'Open loop captured', detail: loop.task.slice(0, 80) });
  return loop;
}

export function completeLoop(id: string): void {
  save(
    listLoops().map((l) => (l.id === id ? { ...l, status: 'done' as const } : l)),
  );
}

export function snoozeLoop(id: string, until: string): void {
  save(
    listLoops().map((l) => (l.id === id ? { ...l, status: 'snoozed' as const, snoozedUntil: until } : l)),
  );
}

/** Idempotent upsert for the monitor: same source+ref updates in place, never duplicates. */
export function upsertLoop(loop: Omit<OpenLoop, 'id' | 'createdAt' | 'status'> & { id?: string }): void {
  const list = listLoops();
  const existing = loop.ref ? list.find((l) => l.source === loop.source && l.ref === loop.ref) : undefined;
  if (existing) {
    save(list.map((l) => (l.id === existing.id ? { ...l, ...loop, id: existing.id } : l)));
  } else {
    captureLoop(loop);
  }
}
