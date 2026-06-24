import type {
  BriefingData,
  InboxData,
  TrelloData,
  CalendarData,
  SlackData,
  BufferData,
  DriveData,
} from '@/lib/marvin-protocol';

/**
 * Read-only data the renderer pulls from the sidecar (which owns the tokens and
 * makes the real Gmail/Calendar/Slack/Trello/Buffer calls). Each returns null if
 * the sidecar is unreachable so the UI can fall back to a clean empty state.
 */

const SIDECAR_URL =
  process.env.NEXT_PUBLIC_MARVIN_SIDECAR_URL ?? 'http://localhost:8787';

async function get<T>(path: string): Promise<T | null> {
  try {
    const resp = await fetch(`${SIDECAR_URL}${path}`);
    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  }
}

export const fetchBriefingData = () => get<BriefingData>('/data/briefing');
export const fetchInbox = () => get<InboxData>('/data/inbox');
export const fetchTrello = () => get<TrelloData>('/data/trello');
export const fetchCalendar = () => get<CalendarData>('/data/calendar');
export const fetchDrive = () => get<DriveData>('/data/drive');
export const fetchSlack = () => get<SlackData>('/data/slack');
export const fetchBuffer = () => get<BufferData>('/data/buffer');
