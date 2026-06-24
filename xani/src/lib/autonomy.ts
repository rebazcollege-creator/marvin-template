import { readJson, writeJson } from '@/lib/storage';

/**
 * Autonomy = the trust gate. Per category, MARVIN may act automatically (auto),
 * pause for a nod (ask), or never act (never). Persisted (key 'xani.autonomy.v1')
 * and exported via get/set so the runtime action-guard can consult it later.
 * Defaults are deliberately cautious.
 */

export type Level = 'auto' | 'ask' | 'never';

export type AutonomyDef = { id: string; label: string; sub: string };

export const AUTONOMY_DEFS: AutonomyDef[] = [
  { id: 'email', label: 'Send email', sub: 'Replies and new messages' },
  { id: 'social', label: 'Publish posts', sub: 'Buffer, Instagram, X' },
  { id: 'calendar', label: 'Manage calendar', sub: 'Create, move, decline events' },
  { id: 'files', label: 'Edit files', sub: 'Drive docs and sheets' },
  { id: 'slack', label: 'Post to Slack', sub: 'Channels and DMs' },
];

const KEY = 'xani.autonomy.v1';

const DEFAULTS: Record<string, Level> = {
  email: 'ask',
  social: 'ask',
  calendar: 'auto',
  files: 'ask',
  slack: 'never',
};

export function getAutonomy(): Record<string, Level> {
  return { ...DEFAULTS, ...readJson<Record<string, Level>>(KEY, {}) };
}

export function setAutonomy(map: Record<string, Level>): void {
  writeJson(KEY, map);
}
