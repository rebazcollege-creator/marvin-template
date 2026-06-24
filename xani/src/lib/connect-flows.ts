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

const googleService = (envHint: string): ConnectMethod => ({
  id: 'service',
  label: 'Use OAuth app credentials',
  blurb: 'Paste an OAuth client + refresh token you generated yourself. Best for power users and headless setups.',
  kind: 'form',
  envHint,
  docsLabel: 'Google Cloud console',
  docsUrl: 'https://console.cloud.google.com/apis/credentials',
  fields: [
    { key: 'clientId', label: 'Client ID', placeholder: '…apps.googleusercontent.com' },
    { key: 'clientSecret', label: 'Client secret', type: 'password', placeholder: 'GOCSPX-…' },
    { key: 'refreshToken', label: 'Refresh token', type: 'password', placeholder: '1//0g…' },
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
        { id: 'read', label: 'Read mail', desc: 'Triage, summarise and draft from your inbox.', required: true },
        { id: 'send', label: 'Send mail', desc: 'Send replies you approve in Approvals.' },
        { id: 'labels', label: 'Manage labels', desc: 'Sort and archive into labels.' },
        { id: 'contacts', label: 'Read contacts', desc: 'Recognise who people are.' },
      ],
    },
    googleService('GMAIL_<ACCOUNT>_CLIENT_ID / _SECRET / _REFRESH_TOKEN'),
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
        { id: 'read', label: 'Read events', desc: 'See your schedule and free/busy.', required: true },
        { id: 'write', label: 'Manage events', desc: 'Create, move and decline events you approve.' },
      ],
    },
    googleService('GOOGLE_CALENDAR_CLIENT_ID / _SECRET / _REFRESH_TOKEN'),
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
        { id: 'read', label: 'Read files', desc: 'List and open files and folders.', required: true },
        { id: 'write', label: 'Edit files', desc: 'Make changes you approve in Approvals.' },
      ],
    },
    googleService('GOOGLE_DRIVE_CLIENT_ID / _SECRET / _REFRESH_TOKEN'),
  ],
  slack: [
    {
      id: 'oauth',
      label: 'Add to Slack',
      blurb: 'Install the MARVIN app to your workspace with the scopes you pick.',
      kind: 'oauth',
      recommended: true,
      envHint: 'SLACK_<WORKSPACE>_BOT_TOKEN',
      scopes: [
        { id: 'channels', label: 'Read channels', desc: 'Watch the channels you choose.', required: true },
        { id: 'history', label: 'Read messages', desc: 'Surface what’s relevant to you.', required: true },
        { id: 'post', label: 'Post messages', desc: 'Send messages you approve.' },
      ],
    },
    {
      id: 'token',
      label: 'Paste a bot token',
      blurb: 'Use a bot token from your own Slack app.',
      kind: 'form',
      envHint: 'SLACK_<WORKSPACE>_BOT_TOKEN',
      docsLabel: 'Slack API · Your apps',
      docsUrl: 'https://api.slack.com/apps',
      fields: [{ key: 'botToken', label: 'Bot token', type: 'password', placeholder: 'xoxb-…' }],
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
        { key: 'apiKey', label: 'API key', placeholder: 'Your Trello API key' },
        { key: 'token', label: 'Token', type: 'password', placeholder: 'Your Trello token' },
        { key: 'board', label: 'Board ID', placeholder: 'e.g. 683dafe308be04e369b8434c', help: 'The board MARVIN should use.' },
      ],
    },
    {
      id: 'zapier',
      label: 'Via Zapier MCP',
      blurb: 'Route Trello through your Zapier MCP server (no keys stored here).',
      kind: 'form',
      envHint: 'ZAPIER_MCP_SERVER_URL',
      fields: [{ key: 'serverUrl', label: 'Zapier MCP server URL', placeholder: 'https://mcp.zapier.com/api/v1/connect' }],
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
      fields: [{ key: 'accessToken', label: 'Access token', type: 'password', placeholder: '1/…' }],
    },
  ],
};

/** Generic fallback for integrations without bespoke paths yet. */
export function methodsFor(id: string, name: string): ConnectMethod[] {
  const flow = FLOWS[id];
  if (flow) return flow;
  return [
    {
      id: 'oauth',
      label: `Sign in with ${name}`,
      blurb: `Connect ${name} with a sign-in. Native OAuth for ${name} is on the way — for now this records your intent so MARVIN knows it’s available.`,
      kind: 'oauth',
      recommended: true,
      scopes: [
        { id: 'read', label: 'Read', desc: `Let MARVIN read from ${name}.`, required: true },
        { id: 'write', label: 'Act', desc: `Let MARVIN take actions you approve in ${name}.` },
      ],
    },
    {
      id: 'token',
      label: 'Paste an API token',
      blurb: `Use an API token or key from ${name}.`,
      kind: 'form',
      fields: [{ key: 'token', label: 'API token', type: 'password', placeholder: `Your ${name} token` }],
    },
  ];
}
