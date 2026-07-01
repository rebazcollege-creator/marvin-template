import { getSettings, isDayOff } from '@/lib/settings';
import { readJson, writeJson } from '@/lib/storage';

/**
 * Nudge policy (ADHD design report §4, P1.4) — the ONE gate every notification passes
 * through, so nothing in the app can nag. The research is blunt: over-notifying literally
 * induces inattention/hyperactivity, and for ADHD a nagging tool becomes something to
 * avoid. So: quiet by default, batched, time-anchored, snooze-friendly, and silent on
 * days off and during a focus session. Vary the wording so it never hits "alarm blindness".
 */

// Focus Mode sets this while a session is open — never interrupt deep work.
let focusActive = false;
export function setFocusActive(v: boolean): void {
  focusActive = v;
}
export function isFocusActive(): boolean {
  return focusActive;
}

const LAST_KEY = 'xani.nudge.last.v1';
const MIN_GAP_MS = 90 * 60_000; // at most one nudge batch every 90 minutes
const QUIET_BEFORE = 8; // no nudges before 08:00
const QUIET_AFTER = 21; // or after 21:00 (local)

function hourInTz(now: Date, tz: string): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(now));
}

/** True only when it's genuinely OK to interrupt Rebaz right now. */
export function canNudge(now: Date = new Date()): boolean {
  const s = getSettings();
  if (isDayOff(now, s)) return false; // days off: MARVIN initiates nothing
  if (focusActive) return false; // never break a focus session
  const tz = s.profile.timezone || 'Europe/Berlin';
  const h = hourInTz(now, tz);
  if (h < QUIET_BEFORE || h >= QUIET_AFTER) return false; // quiet hours
  const last = readJson<number>(LAST_KEY, 0);
  if (now.getTime() - last < MIN_GAP_MS) return false; // batched, not a trickle
  return true;
}

/** Record that a nudge batch fired (starts the 90-min quiet window). */
export function markNudged(now: Date = new Date()): void {
  writeJson<number>(LAST_KEY, now.getTime());
}

// Varied lead-ins so repeated nudges don't habituate into background noise.
const LEADINS = ['When you have a sec', 'No rush, but', 'Whenever you’re ready', 'Small heads-up', 'For when you surface'];
export function nudgeLeadIn(seed = Date.now()): string {
  return LEADINS[Math.abs(Math.floor(seed)) % LEADINS.length];
}
