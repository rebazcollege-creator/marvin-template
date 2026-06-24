import { readJson, writeJson } from '@/lib/storage';

/**
 * Integration catalogue + connection state. The list of integrations is static;
 * HOW each is connected is user-driven and persisted. Everything defaults to NOT
 * connected — real credentials live in Settings / .env / the OS keychain, so we
 * never pretend a source is live. The connection record captures the chosen
 * method, any linked accounts and granted scopes so the manage view is real.
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

export type ConnState = {
  connected: boolean;
  method?: string;
  accounts?: string[];
  scopes?: string[];
  connectedAt?: string;
};

const KEY = 'xani.connections.v2';
const LEGACY_KEY = 'xani.connections.v1';

export function getConnections(): Record<string, ConnState> {
  const v2 = readJson<Record<string, ConnState>>(KEY, {});
  if (Object.keys(v2).length > 0) return v2;
  // migrate the old boolean map, if any
  const legacy = readJson<Record<string, boolean>>(LEGACY_KEY, {});
  const migrated: Record<string, ConnState> = {};
  for (const [id, on] of Object.entries(legacy)) {
    if (on) migrated[id] = { connected: true, method: 'oauth' };
  }
  return migrated;
}

export function setConnection(id: string, state: ConnState): void {
  const all = getConnections();
  all[id] = state;
  writeJson(KEY, all);
}

export function removeConnection(id: string): void {
  const all = getConnections();
  delete all[id];
  writeJson(KEY, all);
}
