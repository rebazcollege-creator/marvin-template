import type { SlackMention, SlackWorkspace } from '@/types';

/**
 * Slack connector — Direct MCP, two workspaces.
 *
 * Workspace 1 — The Amargi:
 *   #general   C0HRYE891
 *   #tt-arabic C052Z75EY73
 * Workspace 2 — LeadStories:
 *   Check-in/check-out + emergency trend drops, plus mentions.
 *
 * Status: Amargi wired via direct MCP; LeadStories pending OAuth.
 */

export const AMARGI_CHANNELS = {
  general: 'C0HRYE891',
  ttArabic: 'C052Z75EY73',
} as const;

/** Unread mentions across both workspaces. Emergency trend drops flagged. */
export async function getMentions(): Promise<SlackMention[]> {
  // TODO: query both workspaces via MCP, flag LeadStories emergency channel.
  return [];
}

/** All workspaces can be posted to (still gated by Approvals confirmation). */
export function canPost(_workspace: SlackWorkspace): boolean {
  return true;
}
