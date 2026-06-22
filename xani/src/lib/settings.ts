import { MARVIN_SYSTEM_PROMPT } from '@/prompts/marvin';
import { AMARGI_SYSTEM_PROMPT } from '@/prompts/amargi';
import { LEADSTORIES_SYSTEM_PROMPT } from '@/prompts/leadstories';
import { MOONSHOT_SYSTEM_PROMPT } from '@/prompts/moonshot';
import { ROUTINE_MODEL, STUDIO_MODEL } from '@/lib/anthropic';

/**
 * Xanî is a single-user app built for Rebaz. Everything here is meant to be
 * editable from the Settings UI — prompts, days off, profile, model routing.
 *
 * The prompt files (src/prompts/*) and model constants are the FACTORY DEFAULTS.
 * User edits are stored as an override layer in localStorage and merged on load,
 * so resetting any field restores the original brief-defined behaviour.
 *
 * Persistence today: localStorage (works in both `next dev` and the Tauri
 * webview). When the Tauri fs bridge lands, swap the load/save bodies to read
 * and write a config.json on disk — the rest of the app calls getSettings().
 */

export const WEEKDAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
] as const;

export interface XaniSettings {
  profile: {
    name: string;
    timezone: string;
  };
  /** Weekday numbers (0=Sun … 6=Sat) on which MARVIN stays silent. */
  daysOff: number[];
  prompts: {
    marvin: string;
    amargi: string;
    leadstories: string;
    moonshot: string;
  };
  models: {
    routine: string;
    studio: string;
  };
}

export const DEFAULT_SETTINGS: XaniSettings = {
  profile: {
    name: 'Rebaz',
    timezone: 'Europe/Berlin',
  },
  daysOff: [0, 2], // Sunday + Tuesday
  prompts: {
    marvin: MARVIN_SYSTEM_PROMPT,
    amargi: AMARGI_SYSTEM_PROMPT,
    leadstories: LEADSTORIES_SYSTEM_PROMPT,
    moonshot: MOONSHOT_SYSTEM_PROMPT,
  },
  models: {
    routine: ROUTINE_MODEL,
    studio: STUDIO_MODEL,
  },
};

const STORAGE_KEY = 'xani.settings.v1';

/** Deep-merge a stored override layer over the factory defaults. */
function mergeWithDefaults(stored: Partial<XaniSettings> | null): XaniSettings {
  if (!stored) return structuredClone(DEFAULT_SETTINGS);
  return {
    profile: { ...DEFAULT_SETTINGS.profile, ...stored.profile },
    daysOff: stored.daysOff ?? DEFAULT_SETTINGS.daysOff,
    prompts: { ...DEFAULT_SETTINGS.prompts, ...stored.prompts },
    models: { ...DEFAULT_SETTINGS.models, ...stored.models },
  };
}

/** Read the effective settings (defaults + user overrides). SSR-safe. */
export function getSettings(): XaniSettings {
  if (typeof window === 'undefined') return structuredClone(DEFAULT_SETTINGS);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return mergeWithDefaults(raw ? (JSON.parse(raw) as Partial<XaniSettings>) : null);
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

/** Persist the full settings object. */
export function saveSettings(settings: XaniSettings): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** Wipe overrides and return to factory defaults. */
export function resetSettings(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/** Is the given date a configured day off, in the user's timezone? */
export function isDayOff(date: Date, settings: XaniSettings): boolean {
  const weekdayName = new Intl.DateTimeFormat('en-US', {
    timeZone: settings.profile.timezone,
    weekday: 'long',
  }).format(date);
  const map: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };
  return settings.daysOff.includes(map[weekdayName]);
}
