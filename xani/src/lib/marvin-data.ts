import type { BriefingData } from '@/lib/marvin-protocol';

/**
 * Read-only data the renderer pulls from the sidecar (which owns the tokens and
 * makes the real Gmail/Calendar/Slack/Trello/Buffer calls). Returns null if the
 * sidecar is unreachable, so the UI can fall back to a clean empty state.
 */

const SIDECAR_URL =
  process.env.NEXT_PUBLIC_MARVIN_SIDECAR_URL ?? 'http://localhost:8787';

export async function fetchBriefingData(): Promise<BriefingData | null> {
  try {
    const resp = await fetch(`${SIDECAR_URL}/data/briefing`);
    if (!resp.ok) return null;
    return (await resp.json()) as BriefingData;
  } catch {
    return null;
  }
}
