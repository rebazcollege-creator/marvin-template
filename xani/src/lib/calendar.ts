import type { CalendarEvent } from '@/types';

/**
 * Google Calendar connector — multi-calendar.
 *
 * Pattern reference (read-only, do not import):
 *   reference/personal-ai-assistant/src/tools/calendar/*
 *   reference/ai-voice-assistant — Google Calendar pipeline
 *
 * Status: pending OAuth (Phase 4). Returns empty until configured.
 */

function hasCredentials(): boolean {
  return Boolean(
    process.env.GOOGLE_CALENDAR_CLIENT_ID &&
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET &&
      process.env.GOOGLE_CALENDAR_REFRESH_TOKEN,
  );
}

/** Today's events across all calendars (Europe/Berlin). Read-only. */
export async function getTodaysEvents(): Promise<CalendarEvent[]> {
  // TODO(Phase 4): query each calendar for the Berlin day window.
  return [];
}

/** Creating or modifying events affects other attendees — always confirm. */
export const EVENT_CHANGE_REQUIRES_CONFIRMATION = true;

export { hasCredentials as calendarConfigured };
