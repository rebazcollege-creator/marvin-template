/**
 * Model routing constants for Xanî. Kept SDK-free on purpose: the renderer
 * (Settings page) imports these to display/edit model routing, and must never
 * pull the Anthropic SDK — or any secret — into the browser bundle.
 *
 * The actual Anthropic client lives in the Node sidecar (src/lib/anthropic.ts),
 * which is never imported by renderer code.
 *
 * Verified current, non-deprecated model IDs (June 2026).
 */

export const ROUTINE_MODEL = 'claude-haiku-4-5';
// Use for: morning briefing synthesis, email triage, badge counts, routing,
//          Slack monitoring summaries, Trello card sorting, memory extraction.

export const STUDIO_MODEL = 'claude-sonnet-4-6';
// Use for: Amargi caption writing, LeadStories fact-checking,
//          Moonshot OIC reports, complex/sensitive email drafts.

export type Task = 'routine' | 'studio';

/** Pick the model for a given class of work. */
export function modelFor(task: Task): string {
  return task === 'studio' ? STUDIO_MODEL : ROUTINE_MODEL;
}
