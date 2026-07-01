import { readJson, writeJson, newId } from '@/lib/storage';

/**
 * Routines (P2) — reusable step scaffolds for the recurring multi-step things (publish
 * flow, weekly review, trip pack). ADHD brains pay the "figure out the steps" tax every
 * single time; a saved routine removes it. Starting a routine drops a single Open Loop with
 * its steps pre-filled (via the loop's breakdown), so it flows through the normal Home UI.
 */

export interface Routine {
  id: string;
  name: string;
  steps: { step: string; estMins: number }[];
  createdAt: string;
}

const KEY = 'xani.routines.v1';

export function listRoutines(): Routine[] {
  return readJson<Routine[]>(KEY, []);
}
function save(list: Routine[]): void {
  writeJson(KEY, list);
  try { window.dispatchEvent(new CustomEvent('xani:routines-changed')); } catch { /* SSR */ }
}

export function addRoutine(name: string, steps: { step: string; estMins: number }[]): Routine {
  const r: Routine = { id: newId(), name: name.trim().slice(0, 120), steps: steps.slice(0, 20), createdAt: new Date().toISOString() };
  save([r, ...listRoutines()]);
  return r;
}

export function removeRoutine(id: string): void {
  save(listRoutines().filter((r) => r.id !== id));
}
