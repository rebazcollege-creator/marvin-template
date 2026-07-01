import { readJson, writeJson, newId } from '@/lib/storage';

/**
 * Automations = standing instructions Xanî runs for you. User-created automations
 * persist via the storage adapter (localStorage now → SQLite later). The template
 * catalogue is a static starting point (no user data); the user's own list starts
 * EMPTY and only the automation engine (later) will record real runs — so we never
 * fabricate run history.
 */

export type Autonomy = 'auto' | 'ask';
export type AutoKind = 'schedule' | 'event';
export type AutoCategory = 'Brief' | 'Inbox' | 'Calendar' | 'Social' | 'Fact-check';

export type AppTouch = 'gmail' | 'gcal' | 'drive' | 'slack' | 'trello' | 'buffer' | 'notetaker' | 'phone';

export type Tinted = { tint: string; edge: string };

export type Automation = {
  id: string;
  name: string;
  trigger: string;
  kind: AutoKind;
  autonomy: Autonomy;
  category: AutoCategory;
  touches: AppTouch[];
  steps: string[];
  enabled: boolean;
  createdAt: string;
};

export type AutoTemplate = Omit<Automation, 'id' | 'enabled' | 'createdAt'> & {
  id: string;
  desc: string;
  glyph: string;
} & Tinted;

const KEY = 'xani.automations.v1';

export const APP_GLYPHS: Record<AppTouch, Tinted & { glyph: string; label: string }> = {
  gmail: { glyph: 'M', label: 'Gmail', tint: 'var(--accent-soft)', edge: '#C0613A' },
  gcal: { glyph: 'C', label: 'Calendar', tint: '#E8EEE5', edge: '#6E8B6A' },
  drive: { glyph: 'D', label: 'Drive', tint: '#F8EFDF', edge: '#D89A4E' },
  slack: { glyph: 'S', label: 'Slack', tint: '#ECE7F1', edge: '#7A6E9C' },
  trello: { glyph: 'T', label: 'Trello', tint: 'var(--accent-soft)', edge: '#C0613A' },
  buffer: { glyph: 'B', label: 'Buffer', tint: '#F8EFDF', edge: '#D89A4E' },
  notetaker: { glyph: 'N', label: 'Notetaker', tint: '#ECE7F1', edge: '#7A6E9C' },
  phone: { glyph: 'P', label: 'Phone', tint: 'var(--hover)', edge: 'var(--text-2)' },
};

export const AUTO_TEMPLATES: AutoTemplate[] = [
  {
    id: 't1',
    glyph: 'inbox',
    tint: 'var(--accent-soft)',
    edge: '#C0613A',
    name: 'Triage my inbox hourly',
    trigger: 'Every hour',
    desc: 'Sort into Important · News · Calendar, archive the noise.',
    touches: ['gmail'],
    category: 'Inbox',
    kind: 'schedule',
    autonomy: 'auto',
    steps: ['Read new mail', 'Sort & label', 'Archive low-priority'],
  },
  {
    id: 't2',
    glyph: 'brief',
    tint: '#E8EEE5',
    edge: '#6E8B6A',
    name: 'Weekly wrap on Friday',
    trigger: 'Fri · 4 PM',
    desc: 'A digest of what shipped, what slipped, and next week.',
    touches: ['gmail', 'slack', 'trello'],
    category: 'Brief',
    kind: 'schedule',
    autonomy: 'auto',
    steps: ['Gather the week', 'Summarise wins & misses', 'Deliver to Home'],
  },
  {
    id: 't3',
    glyph: 'phone',
    tint: '#ECE7F1',
    edge: '#7A6E9C',
    name: 'Book it for me',
    trigger: 'When you ask',
    desc: 'Place a call to reserve a table or hold, then confirm.',
    touches: ['phone'],
    category: 'Calendar',
    kind: 'event',
    autonomy: 'ask',
    steps: ['Place the call', 'Confirm details', 'Add to calendar'],
  },
  {
    id: 't4',
    glyph: 'check',
    tint: '#F8EFDF',
    edge: '#D89A4E',
    name: 'Turn decisions into cards',
    trigger: 'After each meeting',
    desc: 'Pull action items from notes into Trello.',
    touches: ['notetaker', 'trello'],
    category: 'Calendar',
    kind: 'event',
    autonomy: 'auto',
    steps: ['Read meeting notes', 'Extract action items', 'Create Trello cards'],
  },
];

export const CATEGORIES: AutoCategory[] = ['Brief', 'Inbox', 'Calendar', 'Social', 'Fact-check'];

export function listAutomations(): Automation[] {
  return readJson<Automation[]>(KEY, []);
}

export function saveAutomations(list: Automation[]): void {
  writeJson(KEY, list);
}

/** Classify a free-text instruction into an event/schedule automation. */
export function fromText(text: string): Automation {
  const t = text.trim();
  const lower = t.toLowerCase();
  const isEvent = /\b(when|if|after|arrives?|replies|reply|lands|each meeting|every meeting|someone)\b/.test(lower);
  const kind: AutoKind = isEvent ? 'event' : 'schedule';

  let trigger = 'On a schedule';
  if (isEvent) trigger = 'When it happens';
  else if (/hour/.test(lower)) trigger = 'Hourly';
  else if (/weekday/.test(lower)) trigger = 'Every weekday';
  else if (/daily|every day|each day|every morning/.test(lower)) trigger = 'Daily';
  else if (/week|friday|monday|tuesday|wednesday|thursday|saturday|sunday/.test(lower)) trigger = 'Weekly';

  let category: AutoCategory = 'Brief';
  if (/mail|inbox|email/.test(lower)) category = 'Inbox';
  else if (/calendar|meeting|schedule|book|call/.test(lower)) category = 'Calendar';
  else if (/post|social|buffer|instagram|caption/.test(lower)) category = 'Social';
  else if (/fact|claim|verify|debunk/.test(lower)) category = 'Fact-check';

  const touches: AppTouch[] = [];
  if (/mail|inbox|email/.test(lower)) touches.push('gmail');
  if (/calendar|meeting|event/.test(lower)) touches.push('gcal');
  if (/slack/.test(lower)) touches.push('slack');
  if (/trello|card/.test(lower)) touches.push('trello');
  if (/buffer|post|caption/.test(lower)) touches.push('buffer');
  if (/drive|file|doc|sheet/.test(lower)) touches.push('drive');
  if (touches.length === 0) touches.push('gmail');

  return {
    id: newId(),
    name: t.charAt(0).toUpperCase() + t.slice(1),
    trigger,
    kind,
    autonomy: 'ask',
    category,
    touches,
    steps: ['Watch for the trigger', 'Do the work', 'Report back / ask before sending'],
    enabled: true,
    createdAt: new Date().toISOString(),
  };
}

export function fromTemplate(t: AutoTemplate): Automation {
  return {
    id: newId(),
    name: t.name,
    trigger: t.trigger,
    kind: t.kind,
    autonomy: t.autonomy,
    category: t.category,
    touches: t.touches,
    steps: t.steps,
    enabled: true,
    createdAt: new Date().toISOString(),
  };
}

/** Rough "runs this week" estimate for an automation, for the stats strip. */
export function weeklyEstimate(a: Automation): number {
  if (a.kind === 'event') return 0;
  switch (a.trigger) {
    case 'Hourly':
      return 40;
    case 'Every weekday':
      return 5;
    case 'Daily':
      return 7;
    case 'Weekly':
      return 1;
    default:
      return 7;
  }
}
