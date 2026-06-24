import { readJson, writeJson, newId } from '@/lib/storage';

/**
 * Activity log — a real record of what actually happened in the app: actions
 * prepared for Approvals, approvals decided, automations created/run, notes saved,
 * connections changed. Surfaces call logActivity() on real events, so the Activity
 * feed is genuinely populated (never fabricated). Capped + persisted.
 */

export type ActivityKind =
  | 'approval'
  | 'approved'
  | 'rejected'
  | 'automation'
  | 'note'
  | 'connection'
  | 'memory';

export type ActivityEvent = {
  id: string;
  kind: ActivityKind;
  title: string;
  detail?: string;
  tag?: string;
  at: string;
};

const KEY = 'xani.activity.v1';
const MAX = 200;

export function listActivity(): ActivityEvent[] {
  return readJson<ActivityEvent[]>(KEY, []);
}

export function logActivity(input: { kind: ActivityKind; title: string; detail?: string; tag?: string }): void {
  const ev: ActivityEvent = { id: newId(), at: new Date().toISOString(), ...input };
  writeJson(KEY, [ev, ...listActivity()].slice(0, MAX));
  try {
    window.dispatchEvent(new CustomEvent('xani:activity'));
  } catch {
    /* SSR / no window */
  }
}
