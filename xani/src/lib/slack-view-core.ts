/**
 * Slack sidebar model — pure logic (no imports) so it is unit-testable and shared
 * by the page. Mirrors how real Slack surfaces what matters (Slack's own guidance:
 * "your topmost section should contain your most critical conversations… catch them
 * the moment they're unread"):
 *
 *   1. Unread   — every conversation with new messages, most-recent first. The one
 *                 glance that answers "what needs me". Channels + DMs mixed, because
 *                 an unread DM matters as much as an unread channel.
 *   2. Direct   — the rest of your DMs/group-DMs, most-recent first (so people are
 *                 always reachable and never buried under a wall of channels).
 *   3. Channels — the rest of your channels, most-recent activity first. Quiet ones
 *                 collapse behind "show more" so the default view isn't noise.
 *
 * Default-open follows importance, not the alphabet: the top unread, else the most
 * recent DM, else the most recent channel.
 */

export type ConvoKind = 'channel' | 'dm' | 'group';

export interface SidebarConvo {
  id: string;
  workspace: string;
  name: string;
  kind: ConvoKind;
  unread: number;
  hasUnread: boolean;
  /** Slack ts (seconds, as a string) of the latest message — drives recency. */
  lastTs?: string;
}

export interface Sidebar {
  unread: SidebarConvo[];
  dms: SidebarConvo[];
  channels: SidebarConvo[];
  /** Sum of unread counts across the workspace (for the workspace badge). */
  totalUnread: number;
}

/** Most-recent first; conversations with no timestamp sort last. */
function byRecency(a: SidebarConvo, b: SidebarConvo): number {
  return Number(b.lastTs ?? 0) - Number(a.lastTs ?? 0);
}

/**
 * Split one workspace's conversations into the three sections. A conversation is
 * shown in AT MOST one section (unread items live only in Unread, so nothing is
 * duplicated in the same scroll).
 */
export function buildSidebar(convos: SidebarConvo[]): Sidebar {
  const unread = convos.filter((c) => c.hasUnread).sort(byRecency);
  const readRest = convos.filter((c) => !c.hasUnread);
  const dms = readRest.filter((c) => c.kind === 'dm' || c.kind === 'group').sort(byRecency);
  const channels = readRest
    .filter((c) => c.kind === 'channel')
    .sort((a, b) => byRecency(a, b) || a.name.localeCompare(b.name));
  const totalUnread = unread.reduce((n, c) => n + (c.unread || 0), 0);
  return { unread, dms, channels, totalUnread };
}

/** The conversation to open by default: top unread → most-recent DM → recent channel. */
export function defaultConversationId(s: Sidebar): string | null {
  return s.unread[0]?.id ?? s.dms[0]?.id ?? s.channels[0]?.id ?? null;
}

/** How many quiet channels to show before collapsing the rest behind "show more". */
export const QUIET_CHANNELS_SHOWN = 8;
