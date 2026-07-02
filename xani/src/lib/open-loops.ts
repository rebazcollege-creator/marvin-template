import { readJson, writeJson, newId } from '@/lib/storage';
import { logActivity } from '@/lib/activity';
import { recordWin } from '@/lib/momentum';

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
  /** For Slack loops: enough context to draft a reply. */
  slack?: { workspace: string; channelId: string; channel: string; from: string; text: string };
  /** MARVIN's interpreted one-line summary (what it is + action) — shown instead of raw subject. */
  headline?: string;
  /** Time-visibility: rough total estimate in minutes (from breakdown or manual). */
  estMins?: number;
  /** ADHD "break it down": tiny concrete steps, first one startable in <2 min. */
  steps?: { step: string; estMins: number; done?: boolean }[];
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
  slack?: { workspace: string; channelId: string; channel: string; from: string; text: string };
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
    slack: input.slack,
  };
  save([loop, ...listLoops()]);
  logActivity({ kind: 'note', title: 'Open loop captured', detail: loop.task.slice(0, 80) });
  return loop;
}

export function completeLoop(id: string): void {
  const done = listLoops().find((l) => l.id === id);
  save(
    listLoops().map((l) => (l.id === id ? { ...l, status: 'done' as const } : l)),
  );
  if (done && done.status !== 'done') recordWin(done.task, 'loop'); // a real, celebrated win
}

export function snoozeLoop(id: string, until: string): void {
  save(
    listLoops().map((l) => (l.id === id ? { ...l, status: 'snoozed' as const, snoozedUntil: until } : l)),
  );
}

/** Refine a loop in place (AI brain-dump sort: cleaned title / estimate / kind). */
export function refineLoop(id: string, patch: Partial<Pick<OpenLoop, 'task' | 'estMins' | 'channel' | 'headline'>>): void {
  save(listLoops().map((l) => (l.id === id ? { ...l, ...patch } : l)));
}

/** Persist a break-it-down onto a loop (steps + summed estimate) — survives reloads. */
export function setLoopBreakdown(id: string, steps: { step: string; estMins: number; done?: boolean }[]): void {
  const estMins = steps.reduce((a, s) => a + (s.estMins || 0), 0);
  save(listLoops().map((l) => (l.id === id ? { ...l, steps, estMins } : l)));
}

/** Toggle a single breakdown step done (the tiny-win dopamine tick). */
export function toggleLoopStep(id: string, index: number): void {
  save(
    listLoops().map((l) => {
      if (l.id !== id || !l.steps) return l;
      const steps = l.steps.map((s, i) => (i === index ? { ...s, done: !s.done } : s));
      return { ...l, steps };
    }),
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
