import { ingestMemory, getMemories } from '@/lib/memory';

/**
 * Triage learning — the self-development core (docs/self-development.md §2).
 *
 * Every time Rebaz corrects a triage decision ("Not for me" on something MARVIN
 * flagged, or "Track it" on something it under-rated) it becomes a durable,
 * high-trust memory through the write-gate (memory.ts). Corrections are a trusted
 * source → active immediately, but always visible and removable on /memory.
 *
 * The learnings are then injected into the triage prompt (see triageLearnings),
 * so MARVIN's judgement gets sharper and Rebaz has to correct it less over time.
 * This works fully offline — capture + store + curate need no API; only the
 * *effect* (a sharper triage) shows once the runtime can call the model again.
 */

export type TriageMedium = 'email' | 'slack';
export type TriageDecision = 'ignore' | 'act';

/** Record a triage correction as a durable memory. Returns the phrased rule. */
export function recordTriageCorrection(input: {
  medium: TriageMedium;
  from: string;
  /** Subject line (email) or a short snippet (Slack). */
  subject: string;
  decision: TriageDecision;
}): string {
  const where = input.medium === 'email' ? 'email' : 'Slack message';
  const subj = input.subject.length > 90 ? `${input.subject.slice(0, 87)}…` : input.subject;

  const content =
    input.decision === 'ignore'
      ? `Rebaz filed a ${where} from "${input.from}" ("${subj}") as not needing him. ` +
        `Treat routine ${where}s from "${input.from}" as low-priority — surface them only when ` +
        `they name Rebaz directly or clearly ask him to do something.`
      : `Rebaz tracked a ${where} from "${input.from}" ("${subj}") as a real commitment. ` +
        `Senders like "${input.from}" usually need him — lean toward surfacing them.`;

  ingestMemory({
    category: input.decision === 'ignore' ? 'correction' : 'preference',
    source: 'correction', // trusted → active immediately (write-gate)
    content,
    importance: input.decision === 'ignore' ? 6 : 3,
  });
  return content;
}

/**
 * The learnings to inject into the triage prompt: active memories that came from
 * Rebaz's corrections. Capped so the prompt stays small (and cache-friendly).
 */
export function triageLearnings(limit = 25): string[] {
  return getMemories()
    .filter((m) => m.source === 'correction')
    .slice(0, limit)
    .map((m) => m.content);
}

/** How many things MARVIN has learned from Rebaz's corrections (for the UI). */
export function learnedCount(): number {
  return getMemories().filter((m) => m.source === 'correction').length;
}
