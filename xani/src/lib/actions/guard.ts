import { getSettings, isDayOff } from '@/lib/settings';

/**
 * The single chokepoint for outward (mutating) actions.
 *
 * The brief's hard rules — confirm before any send/post/move/delete, certain
 * integrations are read/monitor-only, nothing on days off — were previously
 * scattered as advisory booleans across the connectors that nothing called. The
 * runtime tool loop MUST route every tool call through `evaluateAction()` before
 * executing it, so the rules are enforced in code, not merely in the prompt.
 *
 * (Per Anthropic's tool-use guidance: prompt-level instruction is a second
 * layer; the runtime gate is the primary control.)
 */

export type Integration =
  | 'gmail'
  | 'slack'
  | 'trello'
  | 'buffer'
  | 'calendar'
  | 'notion';

export type ActionKind = 'read' | 'write';

export interface ActionRequest {
  integration: Integration;
  kind: ActionKind;
  /** Tool/operation name, e.g. 'send_email', 'list_threads', 'move_card'. */
  op: string;
  /** Gmail account role or Slack workspace, when relevant. */
  scope?: string;
}

export interface ActionVerdict {
  /** Whether the action may proceed at all (some are never allowed). */
  allowed: boolean;
  /** Whether explicit user confirmation is required before executing. */
  requiresConfirmation: boolean;
  reason: string;
}

/** Integrations/scopes that are read/monitor-only — writes are never allowed. */
const READ_ONLY_SCOPES = new Set<string>([
  'gmail:leadstories', // LeadStories Gmail — read/alert only
  'slack:leadstories', // LeadStories Slack — monitor only, never post/log
]);

/** Classify a tool by name. Anything not clearly a read is treated as a write. */
const READ_PREFIXES = ['list', 'get', 'read', 'search', 'fetch', 'count', 'summar'];

export function classifyOp(op: string): ActionKind {
  const lower = op.toLowerCase();
  return READ_PREFIXES.some((p) => lower.startsWith(p)) ? 'read' : 'write';
}

export function evaluateAction(
  action: ActionRequest,
  at: Date = new Date(),
): ActionVerdict {
  const kind = action.kind ?? classifyOp(action.op);

  // Reads are always permitted and never need confirmation.
  if (kind === 'read') {
    return { allowed: true, requiresConfirmation: false, reason: 'Read-only action.' };
  }

  // Writes to read/monitor-only scopes are never allowed.
  const scopeKey = action.scope ? `${action.integration}:${action.scope}` : '';
  if (scopeKey && READ_ONLY_SCOPES.has(scopeKey)) {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: `${scopeKey} is read/monitor-only — writes are never permitted.`,
    };
  }

  // No initiating actions on configured days off.
  const settings = getSettings();
  if (isDayOff(at, settings)) {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: 'Day off — MARVIN does not initiate outward actions today.',
    };
  }

  // All other writes are allowed but require explicit confirmation.
  return {
    allowed: true,
    requiresConfirmation: true,
    reason: 'Outward action — requires explicit user confirmation.',
  };
}

/** True only when an action may execute right now without further gating. */
export function canExecuteWithoutConfirmation(action: ActionRequest): boolean {
  const v = evaluateAction(action);
  return v.allowed && !v.requiresConfirmation;
}
