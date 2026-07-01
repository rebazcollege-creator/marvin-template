import { readJson, writeJson } from '@/lib/storage';

/**
 * Voice profile — "sound like me" (docs/self-development.md §1.2).
 *
 * Rebaz's own writing is the source of truth for his language and tone. Train mode
 * (/train) reads his real sent emails and past Slack messages (per workspace) and
 * stores them here as style exemplars; every time he edits a draft before sending,
 * his edited version is added as a fresh sample. The drafter injects these so replies
 * match how HE actually writes — his language (English/Kurdish/Arabic/German), tone,
 * greeting, length, sign-off.
 *
 * Local store (same adapter as memory/loops). Keyed by medium + scope:
 *   email → "email:all" (one voice across his accounts)
 *   slack → "slack:<workspace>" (amargi / leadstories write differently)
 */

export type VoiceMedium = 'email' | 'slack';

export interface VoiceProfile {
  /** Real examples of Rebaz's writing — the drafter mimics these. */
  samples: string[];
  /** Short voice corrections learned from his draft edits. */
  notes: string[];
  trainedAt?: string;
}

const KEY = 'xani.voice.v1';
const EMPTY: VoiceProfile = { samples: [], notes: [] };

type Store = Record<string, VoiceProfile>;
function keyOf(medium: VoiceMedium, scope: string): string {
  return `${medium}:${scope}`;
}
function all(): Store {
  return readJson<Store>(KEY, {});
}

export function getVoice(medium: VoiceMedium, scope: string): VoiceProfile {
  return all()[keyOf(medium, scope)] ?? EMPTY;
}

/** Replace the exemplar set for a scope (Train mode "save as my voice"). */
export function setVoiceSamples(medium: VoiceMedium, scope: string, samples: string[]): void {
  const store = all();
  const k = keyOf(medium, scope);
  store[k] = { ...(store[k] ?? EMPTY), samples: samples.slice(0, 14), trainedAt: new Date().toISOString() };
  writeJson(KEY, store);
}

/** Add one more exemplar (used when Rebaz edits a draft — his edit is real writing). */
export function addVoiceSampleByKey(voiceKey: string, text: string): void {
  const t = text.trim();
  if (!t || !voiceKey.includes(':')) return;
  const store = all();
  const cur = store[voiceKey] ?? EMPTY;
  // Dedupe and keep the most recent 14.
  const samples = [t, ...cur.samples.filter((s) => s !== t)].slice(0, 14);
  store[voiceKey] = { ...cur, samples, trainedAt: new Date().toISOString() };
  writeJson(KEY, store);
}

/** The voice block injected into a draft prompt for this scope (empty if untrained). */
export function voicePromptFor(medium: VoiceMedium, scope: string): string {
  const v = getVoice(medium, scope);
  if (v.samples.length === 0 && v.notes.length === 0) return '';
  const parts: string[] = [];
  if (v.samples.length) {
    parts.push(v.samples.map((s, i) => `— Example ${i + 1} —\n${s}`).join('\n\n'));
  }
  if (v.notes.length) {
    parts.push('Voice corrections he has made:\n' + v.notes.map((n) => `- ${n}`).join('\n'));
  }
  return parts.join('\n\n');
}

export function voiceTrained(medium: VoiceMedium, scope: string): boolean {
  return (all()[keyOf(medium, scope)]?.samples.length ?? 0) > 0;
}
export function voiceKeyFor(medium: VoiceMedium, scope: string): string {
  return keyOf(medium, scope);
}
