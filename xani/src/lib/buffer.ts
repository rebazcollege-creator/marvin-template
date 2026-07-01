import type { BufferStatus } from '@/types';

/**
 * Buffer connector — Direct MCP.
 *
 * Organization: 68d1dabf16b86596e286a44b
 * Channels (7): Instagram, TikTok, X, Facebook, Bluesky, LinkedIn, YouTube
 *
 * Status: wired via direct MCP. Returns null until the bridge is connected so
 * the briefing omits the row rather than showing fake numbers.
 */

export const BUFFER_ORG_ID = '68d1dabf16b86596e286a44b';

/** Queue status for the morning briefing. Read-only. */
export async function getQueueStatus(): Promise<BufferStatus | null> {
  // TODO: call Buffer MCP for draft + scheduled counts per platform.
  return null;
}

/** Publishing to any channel always requires explicit confirmation. */
export const PUBLISH_REQUIRES_CONFIRMATION = true;
