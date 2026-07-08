import { readJson, writeJson } from '@/lib/storage';
import { activeLoops, completeLoop, snoozeLoop, type OpenLoop } from '@/lib/open-loops';
import { recordTriageCorrection } from '@/lib/triage-learning';
import { recordTriageOutcome } from '@/lib/learning-metrics';
import type { TriagedEmail, TriagedSlack } from '@/lib/marvin-protocol';

/**
 * The Today task engine — the heart of the focused app. It fuses everything MARVIN already
 * understands (triaged "act" items from email + Slack, and tracked Open Loops incl. urgent
 * Trello) into ONE curated list of what actually needs Rebaz, and lets him act on each in a
 * way that teaches MARVIN: Done confirms it was a real task, "Not a task" trains it to stop
 * surfacing similar, Later snoozes it. Those signals flow into the same learning layer
 * (triage-learning + learning-metrics) that already sharpens triage — so the list gets better
 * the more he uses it. All local state (done/dismissed/snoozed) persists so items don't
 * resurrect on reload.
 */

export type TaskSource = 'email' | 'slack' | 'trello' | 'manual';
export interface Task {
  id: string;
  title: string;
  source: TaskSource;
  from?: string;
  channel?: string;
  dueAt?: string;
  at?: string;
  kind: 'loop' | 'inbox' | 'slack';
  loop?: OpenLoop;
  email?: TriagedEmail;
  slack?: TriagedSlack;
}

const KEY = 'xani.today.state.v1';
const KEEP_MS = 30 * 24 * 60 * 60 * 1000; // forget done/dismissed after 30 days
type TaskState = { done: Record<string, string>; dismissed: Record<string, string>; snoozed: Record<string, string> };

function getState(): TaskState {
  return readJson<TaskState>(KEY, { done: {}, dismissed: {}, snoozed: {} });
}
function save(st: TaskState): void {
  const now = Date.now();
  const prune = (m: Record<string, string>) => {
    for (const k of Object.keys(m)) if (now - Date.parse(m[k] ?? '') > KEEP_MS) delete m[k];
  };
  prune(st.done); prune(st.dismissed);
  for (const k of Object.keys(st.snoozed)) if (Date.parse(st.snoozed[k] ?? '') < now) delete st.snoozed[k];
  writeJson<TaskState>(KEY, st);
}

/** Underlying-source key so an Open Loop and the raw act-item it came from don't double up. */
function underlyingKey(l: OpenLoop): string {
  if (l.email) return `u:email:${l.email.id}`;
  if (l.slack) return `u:slack:${l.ref ?? ''}`;
  return '';
}

export interface BuildInput { inbox: TriagedEmail[]; slack: TriagedSlack[]; loops?: OpenLoop[]; now?: Date }

/** Assemble the curated, de-duplicated, ranked task list, minus anything done/dismissed or
 *  still snoozed. Nearest hard deadline first, then most-recent source. */
export function buildTasks(input: BuildInput): Task[] {
  const st = getState();
  const nowMs = (input.now ?? new Date()).getTime();
  const loops = input.loops ?? activeLoops(input.now);
  const snoozedActive = (id: string) => !!st.snoozed[id] && Date.parse(st.snoozed[id]!) > nowMs;
  const hidden = (id: string, ukey: string) =>
    !!st.done[id] || !!st.dismissed[id] || snoozedActive(id) || (!!ukey && (!!st.done[ukey] || !!st.dismissed[ukey]));

  const tasks: Task[] = [];
  const loopKeys = new Set<string>();

  for (const l of loops) {
    const ukey = underlyingKey(l);
    if (ukey) loopKeys.add(ukey);
    const id = `loop:${l.id}`;
    if (hidden(id, ukey)) continue;
    tasks.push({ id, kind: 'loop', title: l.headline || l.task, source: (l.source === 'manual' ? 'manual' : l.source) as TaskSource, from: l.from, channel: l.channel, dueAt: l.dueAt, at: l.at ?? l.createdAt, loop: l });
  }
  for (const m of input.inbox) {
    const ukey = `u:email:${m.id}`;
    if (loopKeys.has(ukey) || hidden(`email:${m.id}`, ukey)) continue;
    tasks.push({ id: `email:${m.id}`, kind: 'inbox', title: m.headline || m.subject, source: 'email', from: m.from, channel: m.account, dueAt: m.dueAt, at: m.receivedAt, email: m });
  }
  for (const m of input.slack) {
    const ukey = `u:slack:${m.id}`;
    if (loopKeys.has(ukey) || hidden(`slack:${m.id}`, ukey)) continue;
    const title = m.headline || (m.text.length > 140 ? `${m.text.slice(0, 137)}…` : m.text);
    tasks.push({ id: `slack:${m.id}`, kind: 'slack', title, source: 'slack', from: m.from, channel: m.dm ? `DM · ${m.workspaceName}` : `#${m.channel} · ${m.workspaceName}`, dueAt: m.dueAt, at: m.ts, slack: m });
  }

  tasks.sort((a, b) => {
    const ad = a.dueAt ? Date.parse(a.dueAt) : Infinity;
    const bd = b.dueAt ? Date.parse(b.dueAt) : Infinity;
    if (ad !== bd) return ad - bd;
    return (Date.parse(b.at ?? '') || 0) - (Date.parse(a.at ?? '') || 0);
  });
  return tasks;
}

/** ✓ Done — confirm it was a real task (MARVIN learns to keep surfacing this sender/kind). */
export function markDone(t: Task): void {
  const st = getState(); st.done[t.id] = new Date().toISOString(); save(st);
  if (t.loop) completeLoop(t.loop.id);
  if (t.email) recordTriageCorrection({ medium: 'email', from: t.email.from, subject: t.email.subject, decision: 'act' });
  if (t.slack) recordTriageCorrection({ medium: 'slack', from: t.slack.from, subject: t.slack.text, decision: 'act' });
  recordTriageOutcome('confirmed');
}

/** ✕ Not a task — train MARVIN to stop surfacing this sender/kind, and drop any loop. */
export function dismissTask(t: Task): void {
  const st = getState(); st.dismissed[t.id] = new Date().toISOString(); save(st);
  if (t.loop) completeLoop(t.loop.id);
  if (t.email) recordTriageCorrection({ medium: 'email', from: t.email.from, subject: t.email.subject, decision: 'ignore' });
  if (t.slack) recordTriageCorrection({ medium: 'slack', from: t.slack.from, subject: t.slack.text, decision: 'ignore' });
  recordTriageOutcome('corrected');
}

/** Later — hide until `until`; a loop is snoozed at the source too. */
export function snoozeTask(t: Task, until: Date): void {
  const st = getState(); st.snoozed[t.id] = until.toISOString(); save(st);
  if (t.loop) snoozeLoop(t.loop.id, until.toISOString());
}
