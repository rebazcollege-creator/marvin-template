import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { setCred } from './creds.ts';

/**
 * Real "Sign in with Google" via the desktop **loopback** OAuth flow (the same
 * approach the gcloud CLI uses). The sidecar opens Google's consent screen in the
 * user's browser, runs a one-shot localhost server to catch the redirect, exchanges
 * the code for a refresh token, and stores the credentials in the runtime — so the
 * integration goes live immediately. Requires a one-time Google Cloud OAuth client
 * (type: Desktop app); loopback redirects to 127.0.0.1 need no port pre-registration.
 */

const SCOPES: Record<string, string[]> = {
  gmail: [
    'https://mail.google.com/', // full mailbox: read, send, modify, delete, manage labels
    'https://www.googleapis.com/auth/contacts',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ],
  gcal: [
    'https://www.googleapis.com/auth/calendar', // full read/write on all calendars
    'https://www.googleapis.com/auth/userinfo.email',
  ],
  drive: [
    'https://www.googleapis.com/auth/drive', // full read/write on all Drive files
    'https://www.googleapis.com/auth/userinfo.email',
  ],
};

const KEYS: Record<string, { id: string; secret: string; refresh: string }> = {
  gmail: { id: 'GMAIL_CLIENT_ID_1', secret: 'GMAIL_CLIENT_SECRET_1', refresh: 'GMAIL_REFRESH_TOKEN_1' },
  gcal: { id: 'GOOGLE_CALENDAR_CLIENT_ID', secret: 'GOOGLE_CALENDAR_CLIENT_SECRET', refresh: 'GOOGLE_CALENDAR_REFRESH_TOKEN' },
  drive: { id: 'GOOGLE_DRIVE_CLIENT_ID', secret: 'GOOGLE_DRIVE_CLIENT_SECRET', refresh: 'GOOGLE_DRIVE_REFRESH_TOKEN' },
};

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* user can paste the URL manually from authUrl */
  }
}

function portOf(addr: ReturnType<ReturnType<typeof createServer>['address']>): number {
  return addr && typeof addr === 'object' ? addr.port : 0;
}

export type GoogleLoginResult = { ok: boolean; email?: string; error?: string; authUrl?: string };

export function startGoogleLogin(input: { integration: string; clientId: string; clientSecret: string }): Promise<GoogleLoginResult> {
  const { integration, clientId, clientSecret } = input;
  const scopes = SCOPES[integration];
  const keys = KEYS[integration];
  if (!scopes || !keys) return Promise.resolve({ ok: false, error: 'Unsupported Google integration.' });
  if (!clientId || !clientSecret) return Promise.resolve({ ok: false, error: 'Client ID and client secret are required.' });

  return new Promise<GoogleLoginResult>((resolve) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (r: GoogleLoginResult) => {
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
      const u = new URL(req.url ?? '/', 'http://127.0.0.1');
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
      try {
        const redirect = `http://127.0.0.1:${portOf(server.address())}`;
        const tr = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: 'authorization_code' }),
        });
        const tj = (await tr.json()) as { refresh_token?: string; access_token?: string; error?: string; error_description?: string };
        if (!tr.ok || !tj.refresh_token) {
          const msg = tj.error_description || tj.error || 'No refresh token returned. Remove Xanî from your Google account permissions and try again.';
          res.end(page(`Could not connect — ${msg}`));
          return finish({ ok: false, error: msg });
        }
        setCred(keys.id, clientId);
        setCred(keys.secret, clientSecret);
        setCred(keys.refresh, tj.refresh_token);
        let email: string | undefined;
        try {
          const ir = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${tj.access_token}` } });
          if (ir.ok) email = ((await ir.json()) as { email?: string }).email;
        } catch {
          /* email is optional */
        }
        res.end(page(`✅ ${integration} connected${email ? ` as ${email}` : ''}. You can close this tab and return to Xanî.`));
        finish({ ok: true, email });
      } catch (e) {
        res.end(page('Something went wrong during sign-in.'));
        finish({ ok: false, error: (e as Error).message });
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const redirect = `http://127.0.0.1:${portOf(server.address())}`;
      const authUrl =
        'https://accounts.google.com/o/oauth2/v2/auth?' +
        new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirect,
          response_type: 'code',
          access_type: 'offline',
          prompt: 'consent',
          scope: scopes.join(' '),
        }).toString();
      openBrowser(authUrl);
      // expose the URL so the UI can offer a manual "open" link too
      pendingAuthUrl = authUrl;
    });

    timer = setTimeout(() => finish({ ok: false, error: 'Timed out waiting for Google sign-in.' }), 4 * 60 * 1000);
  });
}

let pendingAuthUrl = '';
export function lastAuthUrl(): string {
  return pendingAuthUrl;
}

function page(msg: string): string {
  return `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui,sans-serif;background:#f7f6f3;color:#1f1f1d;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center;max-width:420px;padding:32px"><div style="font-size:22px;font-weight:600;font-family:Georgia,serif">Xanî</div><p style="margin-top:14px;font-size:15px;line-height:1.5">${msg}</p></div></body>`;
}
