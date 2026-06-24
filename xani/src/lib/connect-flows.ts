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
  scopes?: ConnectScope[];
  fields?: ConnectField[];
  /** Where the runtime reads the real credentials. */
  envHint?: string;
  /** External link for obtaining credentials. */
  docsLabel?: string;
  docsUrl?: string;
};

const googleService = (prefix: string): ConnectMethod => ({
  id: 'service',
  label: 'Use OAuth app credentials',
  blurb: 'Paste an OAuth client + refresh token you generated yourself. Best for power users and headless setups.',
  kind: 'form',
  envHint: `${prefix}_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN`,
  docsLabel: 'Google Cloud console',
  docsUrl: 'https://console.cloud.google.com/apis/credentials',
  fields: [
    { key: 'clientId', label: 'Client ID', placeholder: '…apps.googleusercontent.com', envKey: `${prefix}_CLIENT_ID` },
    { key: 'clientSecret', label: 'Client secret', type: 'password', placeholder: 'GOCSPX-…', envKey: `${prefix}_CLIENT_SECRET` },
    { key: 'refreshToken', label: 'Refresh token', type: 'password', placeholder: '1//0g…', envKey: `${prefix}_REFRESH_TOKEN` },
  ],
});

export const FLOWS: Record<string, ConnectMethod[]> = {
  gmail: [
    {
      id: 'oauth',
      label: 'Sign in with Google',
      blurb: 'Connect one or more Gmail accounts with Google sign-in. You choose exactly what MARVIN may do.',
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
    {
      id: 'service',
      label: 'Use OAuth app credentials',
      blurb: 'Paste an OAuth client + refresh token for one account. Best for power users and headless setups.',
      kind: 'form',
      envHint: 'GMAIL_CLIENT_ID_1 / _SECRET_1 / _REFRESH_TOKEN_1',
      docsLabel: 'Google Cloud console',
      docsUrl: 'https://console.cloud.google.com/apis/credentials',
      fields: [
        { key: 'clientId', label: 'Client ID', placeholder: '…apps.googleusercontent.com', envKey: 'GMAIL_CLIENT_ID_1' },
        { key: 'clientSecret', label: 'Client secret', type: 'password', placeholder: 'GOCSPX-…', envKey: 'GMAIL_CLIENT_SECRET_1' },
        { key: 'refreshToken', label: 'Refresh token', type: 'password', placeholder: '1//0g…', envKey: 'GMAIL_REFRESH_TOKEN_1' },
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
    googleService('GOOGLE_CALENDAR'),
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
    googleService('GOOGLE_DRIVE'),
  ],
  slack: [
    {
      id: 'token',
      label: 'Bot token (full scopes)',
      blurb:
        'Create a Slack app, add the broadest bot scopes (channels/groups/im/mpim: read+history, chat:write, users:read, files:read, reactions, search), install it, and paste the Bot User OAuth Token. (Slack requires HTTPS redirects, so a local one-click sign-in isn’t possible — the token is the way.)',
      kind: 'form',
      recommended: true,
      envHint: 'SLACK_AMARGI_BOT_TOKEN',
      docsLabel: 'Slack API · Your apps',
      docsUrl: 'https://api.slack.com/apps',
      fields: [{ key: 'botToken', label: 'Bot User OAuth Token', type: 'password', placeholder: 'xoxb-…', envKey: 'SLACK_AMARGI_BOT_TOKEN' }],
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
