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

/** Record a triage correction as a durable memory. Returns the phrased rule.
 *
 *  The rule quotes only the SENDER, never the message's own subject/text: these
 *  rules are injected into the trusted triage system prompt, and quoting
 *  attacker-authored content there would let a crafted subject line smuggle
 *  instructions into the prompt the moment Rebaz files it (memory poisoning).
 *  The `subject` input is still accepted for future UI context but is not
 *  embedded in the rule. */
export function recordTriageCorrection(input: {
  medium: TriageMedium;
  from: string;
  /** Subject line (email) or a short snippet (Slack). Not embedded in the rule. */
  subject: string;
  decision: TriageDecision;
}): string {
  const where = input.medium === 'email' ? 'email' : 'Slack message';

  const content =
    input.decision === 'ignore'
      ? `Rebaz filed a ${where} from "${input.from}" as not needing him. ` +
        `Treat routine ${where}s from "${input.from}" as low-priority — surface them only when ` +
        `they name Rebaz directly or clearly ask him to do something.`
      : `Rebaz tracked a ${where} from "${input.from}" as a real commitment. ` +
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
 * Record a sender-level rule from Train mode ("this sender is important / noise").
 * Stronger and broader than a single-message correction — it's a standing judgement
 * about a whole sender. Same write-gate path (trusted → active, visible on /memory).
 */
export function recordSenderRule(input: {
  medium: TriageMedium;
  from: string;
  decision: 'important' | 'noise';
}): string {
  const where = input.medium === 'email' ? 'Emails' : 'Slack messages';
  const content =
    input.decision === 'important'
      ? `${where} from "${input.from}" are important to Rebaz — always surface them.`
      : `${where} from "${input.from}" are noise — file them automatically; only surface if the ` +
        `message names Rebaz directly or clearly asks him to do something.`;
  ingestMemory({ category: 'correction', source: 'correction', content, importance: 7 });
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
