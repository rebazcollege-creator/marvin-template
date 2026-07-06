import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { setCred } from './creds.ts';

const b64url = (b: Buffer): string => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/** Escape untrusted text before it lands in the callback HTML (the `error`/message params
 *  are attacker-influenceable via the redirect → reflected XSS without this). */
function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/**
 * Real one-click sign-in via the desktop **loopback** OAuth flow (as the gcloud
 * and gh CLIs do). The sidecar opens the provider's consent screen in the browser,
 * runs a one-shot localhost server on a FIXED port to catch the redirect, exchanges
 * the code for a token, and stores the credentials so the integration goes live.
 *
 * Works for providers that permit a loopback (http://127.0.0.1) redirect — Google
 * and GitHub. Others (Slack/Notion/…) require HTTPS redirects and use a pasted token.
 *
 * Fixed port so the redirect URI is stable and can be registered where required
 * (GitHub). Configurable via MARVIN_OAUTH_PORT.
 */

const PORT = Number(process.env.MARVIN_OAUTH_PORT ?? 8788);

type Provider = {
  authUrl: string;
  tokenUrl: string;
  /** extra query params on the auth request */
  authParams: Record<string, string>;
  /** ask the token endpoint for JSON (GitHub returns form-encoded otherwise) */
  jsonAccept?: boolean;
  /** which stored token field to write: refresh (Google) or access (GitHub) */
  tokenField: 'refresh_token' | 'access_token';
  /** send PKCE (S256) — Google supports it; GitHub OAuth apps don't, so opt-in per provider */
  pkce?: boolean;
  /** optional endpoint to fetch the account email/login for display */
  whoUrl?: string;
  whoField?: string;
};

const PROVIDERS: Record<string, Provider> = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    authParams: { access_type: 'offline', prompt: 'consent' },
    tokenField: 'refresh_token',
    pkce: true,
    whoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    whoField: 'email',
  },
  github: {
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    authParams: {},
    jsonAccept: true,
    tokenField: 'access_token',
    whoUrl: 'https://api.github.com/user',
    whoField: 'login',
  },
};

/** integration → { provider, scopes, the env keys to store } */
const INTEGRATIONS: Record<string, { provider: string; scopes: string[]; keys: { id?: string; secret?: string; token: string } }> = {
  gmail: {
    provider: 'google',
    scopes: ['https://mail.google.com/', 'https://www.googleapis.com/auth/contacts', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'],
    keys: { id: 'GMAIL_CLIENT_ID_1', secret: 'GMAIL_CLIENT_SECRET_1', token: 'GMAIL_REFRESH_TOKEN_1' },
  },
  gcal: {
    provider: 'google',
    scopes: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/userinfo.email'],
    keys: { id: 'GOOGLE_CALENDAR_CLIENT_ID', secret: 'GOOGLE_CALENDAR_CLIENT_SECRET', token: 'GOOGLE_CALENDAR_REFRESH_TOKEN' },
  },
  drive: {
    provider: 'google',
    scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/userinfo.email'],
    keys: { id: 'GOOGLE_DRIVE_CLIENT_ID', secret: 'GOOGLE_DRIVE_CLIENT_SECRET', token: 'GOOGLE_DRIVE_REFRESH_TOKEN' },
  },
  github: {
    provider: 'github',
    scopes: ['repo', 'workflow', 'read:org', 'gist', 'notifications', 'user'],
    keys: { token: 'GITHUB_TOKEN' },
  },
};

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* user can paste authUrl manually */
  }
}

export type OAuthResult = { ok: boolean; account?: string; error?: string };

export function startOAuthLogin(input: { integration: string; clientId: string; clientSecret: string; slot?: number }): Promise<OAuthResult> {
  const { integration, clientId, clientSecret, slot } = input;
  const baseCfg = INTEGRATIONS[integration];
  if (!baseCfg) return Promise.resolve({ ok: false, error: 'Unsupported integration for one-click sign-in.' });
  // Gmail is multi-account: store into the slot the user chose (1–5) so a second
  // account never overwrites the first. Other integrations use their fixed keys.
  const cfg =
    integration === 'gmail' && slot && slot >= 1 && slot <= 5
      ? { ...baseCfg, keys: { id: `GMAIL_CLIENT_ID_${slot}`, secret: `GMAIL_CLIENT_SECRET_${slot}`, token: `GMAIL_REFRESH_TOKEN_${slot}` } }
      : baseCfg;
  const provider = PROVIDERS[cfg.provider];
  if (!provider) return Promise.resolve({ ok: false, error: 'Unknown OAuth provider.' });
  if (!clientId || !clientSecret) return Promise.resolve({ ok: false, error: 'Client ID and client secret are required.' });

  const redirect = `http://127.0.0.1:${PORT}`;
  // CSRF/code-injection defence: a random state the callback must echo back, and (where the
  // provider supports it) PKCE so an intercepted code can't be exchanged without the verifier.
  const state = randomBytes(16).toString('hex');
  const verifier = provider.pkce ? b64url(randomBytes(32)) : '';
  const challenge = verifier ? b64url(createHash('sha256').update(verifier).digest()) : '';

  return new Promise<OAuthResult>((resolve) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (r: OAuthResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        server.close();
      } catch {
        /* ignore */
      }
      resolve(r);
    };

    const server = createServer(async (req, res) => {
      const u = new URL(req.url ?? '/', redirect);
      const code = u.searchParams.get('code');
      const err = u.searchParams.get('error');
      if (err) {
        res.end(page(`Sign-in cancelled — ${err}. You can close this tab.`));
        return finish({ ok: false, error: err });
      }
      if (!code) {
        res.writeHead(204);
        return res.end();
      }
      // Reject any callback whose state doesn't match the one we issued — a different local
      // process (or a drive-by page) hitting this port with a forged code is dropped here.
      if (u.searchParams.get('state') !== state) {
        res.end(page('Sign-in could not be verified (state mismatch). Please try again.'));
        return finish({ ok: false, error: 'state mismatch' });
      }
      try {
        const tr = await fetch(provider.tokenUrl, {
          signal: AbortSignal.timeout(15_000),
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(provider.jsonAccept ? { Accept: 'application/json' } : {}) },
          body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: 'authorization_code', ...(verifier ? { code_verifier: verifier } : {}) }),
        });
        const tj = (await tr.json()) as Record<string, string>;
        const token = tj[provider.tokenField];
        if (!tr.ok || !token) {
          const msg = tj.error_description || tj.error || 'No token returned. Remove Xanî from your account permissions and try again.';
          res.end(page(`Could not connect — ${msg}`));
          return finish({ ok: false, error: msg });
        }
        if (cfg.keys.id) setCred(cfg.keys.id, clientId);
        if (cfg.keys.secret) setCred(cfg.keys.secret, clientSecret);
        setCred(cfg.keys.token, token);
        let account: string | undefined;
        if (provider.whoUrl && provider.whoField) {
          try {
            const ir = await fetch(provider.whoUrl, { signal: AbortSignal.timeout(15_000), headers: { Authorization: `Bearer ${tj.access_token ?? token}`, Accept: 'application/json', 'User-Agent': 'xani' } });
            if (ir.ok) account = ((await ir.json()) as Record<string, string>)[provider.whoField];
          } catch {
            /* account label is optional */
          }
        }
        res.end(page(`✅ ${integration} connected${account ? ` as ${account}` : ''}. You can close this tab and return to Xanî.`));
        finish({ ok: true, account });
      } catch (e) {
        res.end(page('Something went wrong during sign-in.'));
        finish({ ok: false, error: (e as Error).message });
      }
    });

    server.on('error', (e) => finish({ ok: false, error: `Could not start local sign-in server on port ${PORT}: ${(e as Error).message}` }));
    server.listen(PORT, '127.0.0.1', () => {
      const authUrl =
        provider.authUrl +
        '?' +
        new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirect,
          response_type: 'code',
          scope: cfg.scopes.join(' '),
          state,
          ...(challenge ? { code_challenge: challenge, code_challenge_method: 'S256' } : {}),
          ...provider.authParams,
        }).toString();
      openBrowser(authUrl);
    });

    timer = setTimeout(() => finish({ ok: false, error: 'Timed out waiting for sign-in.' }), 4 * 60 * 1000);
  });
}

function page(msg: string): string {
  // msg can carry provider/error text influenced by the redirect — escape it (reflected XSS).
  return `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui,sans-serif;background:#f7f6f3;color:#1f1f1d;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center;max-width:420px;padding:32px"><div style="font-size:22px;font-weight:600;font-family:Georgia,serif">Xanî</div><p style="margin-top:14px;font-size:15px;line-height:1.5">${escapeHtml(msg)}</p></div></body>`;
}
