import type { EmailMessage, GmailAccountRole, GmailAccountSummary } from '@/types';

/**
 * Gmail connector — 5 accounts, independent OAuth per account.
 *
 * Pattern reference (read-only, do not import):
 *   reference/personal-ai-assistant/src/tools/email/*
 *   reference/ai-voice-assistant — Gmail + STT pipeline
 *
 * Status: pending OAuth (Phase 4). Until refresh tokens are present in the
 * environment, these return empty results — never mocked data.
 */

export const GMAIL_ACCOUNTS: { role: GmailAccountRole; envSuffix: number }[] = [
  { role: 'personal', envSuffix: 1 },
  { role: 'moonshot', envSuffix: 2 },
  { role: 'leadstories', envSuffix: 3 }, // read/alert only — never auto-send
  { role: 'zoho', envSuffix: 4 },
  { role: 'amargi', envSuffix: 5 },
];

function hasCredentials(envSuffix: number): boolean {
  return Boolean(
    process.env[`GMAIL_CLIENT_ID_${envSuffix}`] &&
      process.env[`GMAIL_CLIENT_SECRET_${envSuffix}`] &&
      process.env[`GMAIL_REFRESH_TOKEN_${envSuffix}`],
  );
}

/** Unread counts per account, for the morning briefing. */
export async function getUnreadCounts(): Promise<GmailAccountSummary[]> {
  // TODO(Phase 4): exchange refresh tokens and query each account in parallel.
  return [];
}

/** Recent messages for the unified inbox view. */
export async function listMessages(
  _account?: GmailAccountRole,
): Promise<EmailMessage[]> {
  // TODO(Phase 4): fetch per-account threads, normalise to EmailMessage.
  return [];
}

/**
 * LeadStories is a read/alert-only integration. Sending from it requires
 * explicit per-message confirmation and is never automated.
 */
export function canAutoSend(account: GmailAccountRole): boolean {
  return account !== 'leadstories';
}

export { hasCredentials as gmailAccountConfigured };
