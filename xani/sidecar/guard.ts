import type { ActPayload } from '../src/lib/marvin-protocol.ts';

/**
 * The single, server-side chokepoint for outward (mutating) actions.
 *
 * This lives in the sidecar — the trusted side that actually performs sends — not
 * in the renderer (which can't be trusted to police itself). Every `/act` call and
 * every future write tool must pass through `evaluateAction()` before executing, so
 * the safety rules are enforced in code, not merely promised in a prompt.
 */

/** Who initiated the action — day-off applies only to work the assistant starts. */
export type Actor = 'user_approved' | 'agent_proposed' | 'automation';

export interface GuardResult {
  allowed: boolean;
  reason: string;
}

const KNOWN_KINDS = new Set(['email', 'calendar', 'slack', 'social', 'task']);

/**
 * Action kinds that are never permitted from the runtime (locked rules). Empty
 * today — LeadStories is full-access, and TCS / Moonshot official sheets have no
 * connector to guard — but the seam exists: a future write connector that must
 * stay manual is denied simply by adding its kind here.
 */
const DENIED_KINDS = new Set<string>([]);

/**
 * Weekdays (0=Sun … 6=Sat) on which the assistant must not INITIATE outward
 * actions. Disabled by default (Rebaz hasn't turned days-off on); set
 * XANI_DAYS_OFF="0,2" to enable Sunday+Tuesday. Never blocks a user-approved send.
 */
export function daysOff(): number[] {
  return (process.env.XANI_DAYS_OFF ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

export function evaluateAction(
  payload: ActPayload,
  actor: Actor = 'user_approved',
  at: Date = new Date(),
): GuardResult {
  if (!payload || !KNOWN_KINDS.has(payload.kind)) {
    return { allowed: false, reason: 'Unknown or malformed action — refusing to run it.' };
  }
  if (DENIED_KINDS.has(payload.kind)) {
    return { allowed: false, reason: `“${payload.kind}” is locked and can never run from the runtime.` };
  }
  // Days off restrain only assistant-INITIATED work, never something Rebaz
  // explicitly approved (blocking his own approved send would be wrong).
  if (actor !== 'user_approved' && daysOff().includes(at.getDay())) {
    return { allowed: false, reason: 'It’s a configured day off — the assistant initiates nothing today.' };
  }
  return { allowed: true, reason: 'Permitted.' };
}
