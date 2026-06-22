// Shared domain types for Xanî.

export type GmailAccountRole =
  | 'personal'
  | 'moonshot'
  | 'leadstories'
  | 'zoho'
  | 'amargi';

export interface EmailMessage {
  id: string;
  account: GmailAccountRole;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string; // ISO 8601
  unread: boolean;
}

export interface GmailAccountSummary {
  account: GmailAccountRole;
  unreadCount: number;
}

export interface TrelloCard {
  id: string;
  name: string;
  url: string;
  labels: string[];
  urgent: boolean;
  due: string | null; // ISO 8601 or null
}

export type BufferPlatform =
  | 'instagram'
  | 'tiktok'
  | 'x'
  | 'facebook'
  | 'bluesky'
  | 'linkedin'
  | 'youtube';

export interface BufferStatus {
  drafts: number;
  scheduled: number;
  byPlatform: Partial<Record<BufferPlatform, number>>;
}

export type SlackWorkspace = 'amargi' | 'leadstories';

export interface SlackMention {
  workspace: SlackWorkspace;
  channelId: string;
  channelName: string;
  text: string;
  ts: string;
  isEmergencyTrend: boolean; // LeadStories emergency trend drop
}

export interface CalendarEvent {
  id: string;
  calendar: string;
  title: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
  allDay: boolean;
}

/** Combined payload assembled on homepage load, passed to MARVIN for synthesis. */
export interface BriefingPayload {
  date: string; // ISO 8601, Europe/Berlin
  isDayOff: boolean;
  gmail: GmailAccountSummary[];
  trello: TrelloCard[];
  buffer: BufferStatus | null;
  slack: SlackMention[];
  calendar: CalendarEvent[];
}
