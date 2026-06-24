import { readJson, writeJson } from '@/lib/storage';

/**
 * Integration catalogue. The list of integrations is static; whether each is
 * connected is user-driven and persisted (key 'xani.connections.v1'). Everything
 * defaults to NOT connected — real credentials are added in Settings / .env / the
 * OS keychain, so we never pretend a source is live.
 */

export type Connection = {
  id: string;
  glyph: string;
  name: string;
  category: string;
  desc: string;
  tint: string;
  edge: string;
};

export const CONNECTIONS: Connection[] = [
  { id: 'gmail', glyph: 'M', name: 'Gmail', category: 'Email', desc: 'Read, triage and draft across your accounts.', tint: 'var(--accent-soft)', edge: '#C0613A' },
  { id: 'gcal', glyph: 'C', name: 'Google Calendar', category: 'Calendar', desc: 'See your week and protect focus time.', tint: '#E8EEE5', edge: '#6E8B6A' },
  { id: 'drive', glyph: 'D', name: 'Google Drive', category: 'Files', desc: 'Find and open files and sheets.', tint: '#F8EFDF', edge: '#D89A4E' },
  { id: 'slack', glyph: 'S', name: 'Slack', category: 'Messaging', desc: 'Watch channels and surface what matters.', tint: '#ECE7F1', edge: '#7A6E9C' },
  { id: 'trello', glyph: 'T', name: 'Trello', category: 'Tasks', desc: 'Turn decisions into cards.', tint: 'var(--accent-soft)', edge: '#C0613A' },
  { id: 'buffer', glyph: 'B', name: 'Buffer', category: 'Social', desc: 'Draft and queue posts for approval.', tint: '#F8EFDF', edge: '#D89A4E' },
  { id: 'notion', glyph: 'N', name: 'Notion', category: 'Docs & wiki', desc: 'Pull context from your workspace.', tint: 'var(--hover)', edge: 'var(--text-2)' },
  { id: 'github', glyph: 'G', name: 'GitHub', category: 'Code', desc: 'Track issues and pull requests.', tint: 'var(--hover)', edge: 'var(--text-2)' },
  { id: 'linear', glyph: 'L', name: 'Linear', category: 'Tasks', desc: 'Read and create tickets.', tint: 'var(--hover)', edge: 'var(--text-2)' },
  { id: 'hubspot', glyph: 'H', name: 'HubSpot', category: 'CRM', desc: 'See deals and contacts in context.', tint: 'var(--hover)', edge: 'var(--text-2)' },
  { id: 'zoom', glyph: 'Z', name: 'Zoom', category: 'Meetings', desc: 'Let Notetaker join your calls.', tint: 'var(--hover)', edge: 'var(--text-2)' },
  { id: 'whatsapp', glyph: 'W', name: 'WhatsApp', category: 'Messaging', desc: 'Reach MARVIN from your phone.', tint: 'var(--hover)', edge: 'var(--text-2)' },
];

const KEY = 'xani.connections.v1';

export function getConnected(): Record<string, boolean> {
  return readJson<Record<string, boolean>>(KEY, {});
}

export function setConnected(map: Record<string, boolean>): void {
  writeJson(KEY, map);
}
