import Anthropic from '@anthropic-ai/sdk';

/**
 * Claude API client + model routing for Xanî.
 *
 * Cost target: under $10/month. Routine work runs on Haiku; Studio work
 * (caption writing, fact-checking, OIC reports, complex drafts) runs on Sonnet.
 */

export const ROUTINE_MODEL = 'claude-haiku-4-5';
// Use for: morning briefing synthesis, email triage, badge counts,
//          Slack monitoring summaries, Trello card sorting.

export const STUDIO_MODEL = 'claude-sonnet-4-6';
// Use for: Amargi caption writing, LeadStories fact-checking,
//          Moonshot OIC reports, complex email drafts.

let client: Anthropic | null = null;

/** Lazily construct a singleton Anthropic client. */
export function getAnthropic(): Anthropic {
  if (client) return client;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Copy .env.example to .env.local and fill it in.',
    );
  }

  client = new Anthropic({ apiKey });
  return client;
}

export type Task = 'routine' | 'studio';

/** Pick the model for a given class of work. */
export function modelFor(task: Task): string {
  return task === 'studio' ? STUDIO_MODEL : ROUTINE_MODEL;
}
