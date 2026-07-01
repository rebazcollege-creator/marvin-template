/**
 * Wire protocol shared by the renderer client and the Node sidecar.
 *
 * Types only — no logic, no imports — so the sidecar (plain Node) and the
 * renderer (Next) can both depend on it without dragging window-bound code
 * across the boundary.
 */

/** A cache-friendly system prompt segment (see context.ts builder). */
export interface SystemBlock {
  type: 'text';
  text: string;
  /** When true, the sidecar sets a prompt-cache breakpoint on this block. */
  cache: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** What the renderer POSTs to the sidecar's /chat endpoint. */
export interface ChatRequest {
  model: string;
  system: SystemBlock[];
  messages: ChatMessage[];
  maxTokens?: number;
}

/** A memory MARVIN proposes during a turn (lands in the /memory write-gate). */
export interface ProposedMemory {
  category: string;
  content: string;
  importance?: number;
}

/** A self-adjustment MARVIN proposes during a turn. */
export interface ProposedAdjustment {
  target: string;
  rationale: string;
  proposed: string;
}

/**
 * Aggregated morning-briefing data the sidecar returns from GET /data/briefing.
 * Every source carries a `connected` flag so the UI shows real counts when wired
 * and honest empty states otherwise — never fabricated numbers.
 */
export interface BriefingData {
  gmail: { account: string; unread: number }[];
  trello: { name: string; url: string; urgent: boolean }[];
  buffer: { drafts: number; scheduled: number } | null;
  slack: { workspace: string; text: string; emergency: boolean }[];
  calendar: { title: string; start: string }[];
  connected: {
    gmail: boolean;
    trello: boolean;
    buffer: boolean;
    slack: boolean;
    calendar: boolean;
  };
}

// ── Per-view data payloads (GET /data/*) ──────────────────────────
export interface InboxData {
  connected: boolean;
  /** When present, why the list is empty (auth failure, API disabled, etc.). */
  error?: string;
  /** Opaque per-account page cursor (JSON map account→pageToken). Present when more
   *  history can be loaded; pass it back to fetch the next batch. Absent when done. */
  cursor?: string;
  messages: {
    id: string;
    account: string;
    from: string;
    subject: string;
    snippet: string;
    receivedAt: string;
    unread: boolean;
    /** Smart-triage bucket derived from Gmail labels (IMPORTANT / categories). */
    split?: 'important' | 'calendar' | 'news' | 'other';
  }[];
}

// ── MARVIN email triage (GET /triage/inbox) ───────────────────────
/** act = a real person needs Rebaz to reply/decide/do; know = genuine info, no action;
 *  ignore = marketing/ads/platform noise. Judged by content + intent, not just domain. */
export type EmailVerdict = 'act' | 'know' | 'ignore';
export interface TriagedEmail {
  id: string;
  account: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  verdict: EmailVerdict;
  /** MARVIN's short reason for the verdict (≤ ~8 words). */
  reason: string;
}
export interface InboxTriage {
  connected: boolean;
  triaged: TriagedEmail[];
  error?: string;
}
export interface TrelloData {
  connected: boolean;
  /** `list` = the card's list name (Review/Planning/Video feed/Website feed …);
   *  `status` = the card's Status custom-field value (Published / Ready to Publish).
   *  Both drive the Open Loops flagging rules (docs/triage-rules.md §3). */
  cards: { name: string; url: string; labels: string[]; urgent: boolean; due: string | null; list?: string; status?: string }[];
}
export interface CalendarData {
  connected: boolean;
  events: { title: string; start: string; end: string; allDay: boolean }[];
}
export interface SlackData {
  connected: boolean;
  error?: string;
  /** Workspaces the runtime can see, with which token type is in use and any auth error.
   *  selfId = the authed user's Slack id (user tokens), so triage can drop Rebaz's own messages. */
  workspaces: { role: string; name: string; avBg: string; tokenKind?: 'user' | 'bot'; selfId?: string; error?: string }[];
  /** Channels, private groups and DMs the token can see. Unread is best-effort (user tokens only). */
  channels: {
    workspace: string;
    id: string;
    name: string;
    kind: 'channel' | 'dm' | 'group';
    topic?: string;
    unread: number;
    hasUnread: boolean;
    lastTs?: string;
    preview?: string;
  }[];
  /** Latest message per conversation (cheap, no throttled calls). Full history is on-demand. */
  messages: {
    workspace: string;
    channelId: string;
    channel: string;
    user: string;
    userId?: string;
    text: string;
    ts: string;
    emergency: boolean;
    reactions?: { emoji: string; count: number }[];
    replies?: number;
  }[];
}
/** Slack triage — mirror of email triage, but over recent DM/group/channel history so a
 *  request someone sent yesterday (that Rebaz forgot) still surfaces. Same verdict scheme. */
export type SlackVerdict = 'act' | 'know' | 'ignore';
export interface TriagedSlack {
  /** channelId:ts — stable ref for the Open Loops upsert. */
  id: string;
  workspace: string;
  workspaceName: string;
  channelId: string;
  channel: string;
  /** True for DMs and group DMs (a direct ask). */
  dm: boolean;
  from: string;
  text: string;
  ts: string;
  emergency: boolean;
  verdict: SlackVerdict;
  /** MARVIN's short reason for the verdict (≤ ~8 words). */
  reason: string;
}
export interface SlackTriage {
  connected: boolean;
  triaged: TriagedSlack[];
  error?: string;
}
/** A page of full channel history (on-demand; isolates the rate-limited conversations.history). */
export interface SlackHistory {
  ok: boolean;
  error?: string;
  workspace: string;
  channelId: string;
  messages: SlackData['messages'];
  nextCursor?: string;
}
export interface BufferData {
  connected: boolean;
  drafts: number;
  scheduled: number;
  byPlatform: { platform: string; count: number }[];
}
export type DriveKind = 'folder' | 'doc' | 'sheet' | 'slide' | 'pdf' | 'image' | 'file';
export interface DriveData {
  connected: boolean;
  files: { id: string; name: string; kind: DriveKind; modified: string; starred: boolean }[];
}
export interface GithubData {
  connected: boolean;
  items: { title: string; repo: string; url: string; isPR: boolean }[];
}

/**
 * Outward actions the sidecar can actually perform (POST /act), once approved.
 * Each is cred-gated; with no credentials the sidecar returns ok:false with a note.
 */
export type ActPayload =
  | {
      kind: 'email';
      to: string;
      subject: string;
      body: string;
      account?: string;
      /** Reply threading — keeps the reply in the original Gmail conversation. */
      threadId?: string;
      inReplyTo?: string; // the original Message-ID header
      references?: string;
    }
  | { kind: 'calendar'; title: string; start?: string; end?: string }
  | { kind: 'slack'; channel: string; text: string; workspace?: string; threadTs?: string }
  | { kind: 'social'; platform: string; caption: string }
  | { kind: 'task'; name: string; list?: string; due?: string };

export interface ActResult {
  ok: boolean;
  id?: string;
  url?: string;
  error?: string;
  note?: string;
}

/**
 * Low-stakes, reversible mailbox housekeeping — archive / mark read / star / trash an
 * email, or react / mark-read on Slack. User-initiated from the Inbox/Slack views, so
 * these run immediately (they don't go through the Approvals send-gate).
 */
export type MailboxAction =
  | { kind: 'email.archive' | 'email.read' | 'email.unread' | 'email.star' | 'email.unstar' | 'email.trash'; account: string; id: string }
  | { kind: 'slack.react'; workspace: string; channel: string; ts: string; emoji: string }
  | { kind: 'slack.read'; workspace: string; channel: string; ts: string };

/** Server-sent events streamed back over /chat. */
export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'proposal'; kind: 'memory'; data: ProposedMemory }
  | { type: 'proposal'; kind: 'adjustment'; data: ProposedAdjustment }
  | { type: 'approval_request'; id: string; tool: string; input: unknown; reason: string }
  | { type: 'error'; message: string }
  | {
      type: 'done';
      usage?: {
        input: number;
        output: number;
        cacheRead?: number;
        cacheWrite?: number;
      };
    };
