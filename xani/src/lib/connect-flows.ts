/**
 * Per-integration connection paths. Each integration offers one or more honest
 * methods — OAuth sign-in, app/OAuth credentials, or an API token — each with the
 * scopes it would request and the .env / keychain keys the runtime actually reads.
 * The UI walks these; the runtime (sidecar) consumes the real credentials.
 */

export type FieldType = 'text' | 'password';

export type ConnectField = {
  key: string;
  label: string;
  placeholder?: string;
  type?: FieldType;
  help?: string;
  /** Env-var name the sidecar reads; written to the OS keychain on desktop. */
  envKey?: string;
};

export type ConnectScope = {
  id: string;
  label: string;
  desc: string;
  required?: boolean;
};

export type ConnectMethod = {
  id: string;
  label: string;
  blurb: string;
  kind: 'oauth' | 'form';
  recommended?: boolean;
  multiAccount?: boolean;
  /** Form-only: when false, the user may fill just some fields (e.g. connect one of
   *  several optional workspace tokens). Defaults to true (all fields required). */
  requireAllFields?: boolean;
  scopes?: ConnectScope[];
  fields?: ConnectField[];
  /** Where the runtime reads the real credentials. */
  envHint?: string;
  /** External link for obtaining credentials. */
  docsLabel?: string;
  docsUrl?: string;
};

/**
 * Gmail accounts map to fixed credential slots (_1 … _5). The slot is *not*
 * cosmetic: the runtime keys creds by slot and the inbox derives each message's
 * account role from its slot. So a Gmail account must be connected into its own
 * dedicated slot, never auto-assigned, or accounts clobber each other.
 */
export const GMAIL_ACCOUNTS: { role: string; slot: number; label: string; note?: string }[] = [
  { role: 'personal', slot: 1, label: 'Personal' },
  { role: 'moonshot', slot: 2, label: 'Moonshot' },
  { role: 'leadstories', slot: 3, label: 'LeadStories' },
  { role: 'zoho', slot: 4, label: 'Zoho' },
  { role: 'amargi', slot: 5, label: 'Amargi' },
];

export const FLOWS: Record<string, ConnectMethod[]> = {
  gmail: [
    {
      id: 'oauth',
      label: 'Sign in with Google',
      blurb: 'Connect one or more Gmail accounts with Google sign-in — just your Client ID and secret, then one click. No refresh token to paste.',
      kind: 'oauth',
      recommended: true,
      multiAccount: true,
      envHint: 'GMAIL_<ACCOUNT>_CLIENT_ID / _SECRET / _REFRESH_TOKEN',
      scopes: [
        { id: 'mail', label: 'Full mailbox access', desc: 'Read, search, send, organise, label and delete across your mail.', required: true },
        { id: 'contacts', label: 'Contacts', desc: 'Read and manage your contacts so MARVIN knows who people are.', required: true },
        { id: 'profile', label: 'Account & profile', desc: 'Your email address and basic profile.', required: true },
      ],
    },
  ],
  gcal: [
    {
      id: 'oauth',
      label: 'Sign in with Google',
      blurb: 'See your week and let MARVIN protect focus time.',
      kind: 'oauth',
      recommended: true,
      envHint: 'GOOGLE_CALENDAR_CLIENT_ID / _SECRET / _REFRESH_TOKEN',
      scopes: [
        { id: 'calendar', label: 'Full calendar access', desc: 'See, create, move, decline and delete events across all your calendars.', required: true },
      ],
    },
  ],
  drive: [
    {
      id: 'oauth',
      label: 'Sign in with Google',
      blurb: 'Browse and open your files and sheets.',
      kind: 'oauth',
      recommended: true,
      envHint: 'GOOGLE_DRIVE_CLIENT_ID / _SECRET / _REFRESH_TOKEN',
      scopes: [
        { id: 'drive', label: 'Full Drive access', desc: 'List, open, create, edit and organise all your files and folders.', required: true },
      ],
    },
  ],
  slack: [
    {
      id: 'token',
      label: 'Bot tokens (per workspace)',
      blurb:
        'Connect each workspace with its OAuth tokens. The USER token (xoxp-) is what unlocks unread badges and your DMs — a bot token cannot see either. For each app, add User Token Scopes (channels/groups/im/mpim: read+history, users:read, reactions:read, files:read), reinstall, then paste the xoxp- token. The bot token (xoxb-) is optional and used for posting. Connect either workspace or both — channels are discovered automatically.',
      kind: 'form',
      recommended: true,
      requireAllFields: false,
      multiAccount: true,
      envHint: 'SLACK_AMARGI_USER_TOKEN / SLACK_LEADSTORIES_USER_TOKEN (+ optional _BOT_ tokens)',
      docsLabel: 'Slack API · Your apps',
      docsUrl: 'https://api.slack.com/apps',
      fields: [
        { key: 'amargiUser', label: 'The Amargi — User OAuth Token (unread + DMs)', type: 'password', placeholder: 'xoxp-…', envKey: 'SLACK_AMARGI_USER_TOKEN' },
        { key: 'amargiBot', label: 'The Amargi — Bot Token (optional, for posting)', type: 'password', placeholder: 'xoxb-…', envKey: 'SLACK_AMARGI_BOT_TOKEN' },
        { key: 'leadstoriesUser', label: 'LeadStories — User OAuth Token (unread + DMs)', type: 'password', placeholder: 'xoxp-…', envKey: 'SLACK_LEADSTORIES_USER_TOKEN' },
        { key: 'leadstoriesBot', label: 'LeadStories — Bot Token (optional, for posting)', type: 'password', placeholder: 'xoxb-…', envKey: 'SLACK_LEADSTORIES_BOT_TOKEN' },
      ],
    },
  ],
  trello: [
    {
      id: 'apikey',
      label: 'API key + token',
      blurb: 'Connect a board with a Trello API key and token.',
      kind: 'form',
      recommended: true,
      envHint: 'TRELLO_API_KEY / TRELLO_TOKEN',
      docsLabel: 'Trello power-up admin',
      docsUrl: 'https://trello.com/power-ups/admin',
      fields: [
        { key: 'apiKey', label: 'API key', placeholder: 'Your Trello API key', envKey: 'TRELLO_API_KEY' },
        { key: 'token', label: 'Token', type: 'password', placeholder: 'Your Trello token', envKey: 'TRELLO_TOKEN' },
        { key: 'board', label: 'Board ID', placeholder: 'e.g. 683dafe308be04e369b8434c', help: 'The board MARVIN should use.', envKey: 'TRELLO_BOARD_ID' },
      ],
    },
    {
      id: 'zapier',
      label: 'Via Zapier MCP',
      blurb: 'Route Trello through your Zapier MCP server (no keys stored here).',
      kind: 'form',
      envHint: 'ZAPIER_MCP_SERVER_URL',
      fields: [{ key: 'serverUrl', label: 'Zapier MCP server URL', placeholder: 'https://mcp.zapier.com/api/v1/connect', envKey: 'ZAPIER_MCP_SERVER_URL' }],
    },
  ],
  buffer: [
    {
      id: 'token',
      label: 'Access token',
      blurb: 'Connect Buffer with a personal access token to draft and queue posts.',
      kind: 'form',
      recommended: true,
      envHint: 'BUFFER_ACCESS_TOKEN',
      docsLabel: 'Buffer · API settings',
      docsUrl: 'https://publish.buffer.com/settings/api',
      fields: [{ key: 'accessToken', label: 'Access token', type: 'password', placeholder: '1/…', envKey: 'BUFFER_ACCESS_TOKEN' }],
    },
  ],
  github: [
    {
      id: 'oauth',
      label: 'Sign in with GitHub',
      blurb: 'Connect with a GitHub OAuth app — one click, full scopes (repos, issues, PRs, orgs, gists, notifications).',
      kind: 'oauth',
      recommended: true,
      scopes: [{ id: 'full', label: 'Full access', desc: 'Repositories, issues, pull requests, orgs, gists, notifications and your profile.', required: true }],
    },
    {
      id: 'token',
      label: 'Paste a personal access token',
      blurb: 'Use a GitHub personal access token (classic) with the broadest scopes you want.',
      kind: 'form',
      envHint: 'GITHUB_TOKEN',
      docsLabel: 'GitHub · Tokens',
      docsUrl: 'https://github.com/settings/tokens',
      fields: [{ key: 'token', label: 'Personal access token', type: 'password', placeholder: 'ghp_…', envKey: 'GITHUB_TOKEN' }],
    },
  ],
};

/** Generic fallback for integrations without bespoke paths yet. */
/**
 * Every runtime credential key an integration owns — cleared on disconnect so a
 * removed account stops feeding live data. Gmail spans all five account slots.
 */
export function credKeysFor(id: string): string[] {
  switch (id) {
    case 'gmail':
      return [1, 2, 3, 4, 5].flatMap((n) => [`GMAIL_CLIENT_ID_${n}`, `GMAIL_CLIENT_SECRET_${n}`, `GMAIL_REFRESH_TOKEN_${n}`]);
    case 'gcal':
      return ['GOOGLE_CALENDAR_CLIENT_ID', 'GOOGLE_CALENDAR_CLIENT_SECRET', 'GOOGLE_CALENDAR_REFRESH_TOKEN'];
    case 'drive':
      return ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'GOOGLE_DRIVE_REFRESH_TOKEN'];
    case 'slack':
      return ['SLACK_AMARGI_USER_TOKEN', 'SLACK_AMARGI_BOT_TOKEN', 'SLACK_LEADSTORIES_USER_TOKEN', 'SLACK_LEADSTORIES_BOT_TOKEN'];
    case 'trello':
      return ['TRELLO_API_KEY', 'TRELLO_TOKEN', 'TRELLO_BOARD_ID'];
    case 'buffer':
      return ['BUFFER_ACCESS_TOKEN'];
    case 'github':
      return ['GITHUB_TOKEN'];
    default:
      return [];
  }
}

export function methodsFor(id: string, name: string): ConnectMethod[] {
  const flow = FLOWS[id];
  if (flow) return flow;
  return [
    {
      id: 'token',
      label: 'Paste an API token (full access)',
      blurb: `Create an API token/key in ${name} with the broadest scopes it offers, then paste it here. (${name}'s OAuth needs an HTTPS redirect, so a local one-click sign-in isn't possible — the token is the way.)`,
      kind: 'form',
      recommended: true,
      fields: [{ key: 'token', label: `${name} API token`, type: 'password', placeholder: `Your ${name} token` }],
    },
  ];
}
