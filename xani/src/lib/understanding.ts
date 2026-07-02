import { readJson, writeJson, newId } from '@/lib/storage';

/**
 * Understanding loop (Rebaz's directive: "no room to guess"). Xanî continuously finds the
 * people, references and asks in his connectors that it does NOT understand, turns them into
 * concrete questions, and he answers them in Train whenever he wants. Answered Q&A become
 * durable knowledge that's fed into triage/headlines — so over time the app connects the dots
 * around his work and stops guessing. Ongoing and never "finished".
 *
 * Local store, same adapter as loops/memory. External message context stored here is DATA,
 * never instructions — it's only ever shown to Rebaz and summarised, never executed.
 */

export type QStatus = 'open' | 'answered' | 'skipped';

export interface UnderstandingQ {
  id: string;
  /** The concrete question, e.g. "Who is Jil, and what's their role?" */
  question: string;
  /** What it's about — a person / project / term — for grouping. */
  about?: string;
  /** The snippet that triggered it, so Rebaz has context when answering. */
  context?: string;
  status: QStatus;
  answer?: string;
  createdAt: string;
  answeredAt?: string;
}

const KEY = 'xani.understanding.v1';
const CAP = 400;

function all(): UnderstandingQ[] {
  return readJson<UnderstandingQ[]>(KEY, []);
}
function save(list: UnderstandingQ[]): void {
  writeJson(KEY, list.slice(0, CAP));
  try { window.dispatchEvent(new CustomEvent('xani:understanding-changed')); } catch { /* SSR */ }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function openQuestions(): UnderstandingQ[] {
  return all().filter((q) => q.status === 'open');
}
export function answeredQuestions(): UnderstandingQ[] {
  return all().filter((q) => q.status === 'answered');
}
export function questionCounts(): { open: number; answered: number } {
  const l = all();
  return { open: l.filter((q) => q.status === 'open').length, answered: l.filter((q) => q.status === 'answered').length };
}

/** Add freshly-generated questions, skipping any that duplicate an existing one. */
export function addQuestions(qs: { question: string; about?: string; context?: string }[]): number {
  const list = all();
  const seen = new Set(list.map((q) => norm(q.question)));
  let added = 0;
  for (const q of qs) {
    const text = (q.question ?? '').trim();
    if (!text || seen.has(norm(text))) continue;
    seen.add(norm(text));
    list.unshift({ id: newId(), question: text, about: q.about?.trim() || undefined, context: q.context?.trim() || undefined, status: 'open', createdAt: new Date().toISOString() });
    added += 1;
  }
  if (added) save(list);
  return added;
}

export function answerQuestion(id: string, answer: string): void {
  const a = answer.trim();
  if (!a) return;
  save(all().map((q) => (q.id === id ? { ...q, status: 'answered' as const, answer: a, answeredAt: new Date().toISOString() } : q)));
}
export function skipQuestion(id: string): void {
  save(all().map((q) => (q.id === id ? { ...q, status: 'skipped' as const } : q)));
}

/** Answered knowledge as short "question → answer" facts, to fold into triage so it stops
 *  guessing. Capped so the prompt stays lean. */
export function understandingFacts(limit = 40): string[] {
  return answeredQuestions()
    .slice(0, limit)
    .map((q) => `${q.about ? `${q.about}: ` : ''}${q.answer}`)
    .filter(Boolean);
}
