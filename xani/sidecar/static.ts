import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Static UI serving — the single-port service mode.
 *
 * The sidecar serves the built Next.js export (out/) itself, so the whole app lives
 * on ONE port (8787): no `next dev`, no `.next` cache to ritually delete, no silent
 * port-3001 fallback that made everything look "offline". The renderer reaches the
 * sidecar same-origin, and launchd can supervise one process that IS the app.
 *
 * GET-only, path-traversal-safe (resolved paths must stay inside out/). When out/
 * is missing (dev checkout, never built) "/" gets a plain-language page instead of
 * a mystery 404.
 */

const OUT_DIR = join(process.cwd(), 'out');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

export function uiBuilt(): boolean {
  return existsSync(join(OUT_DIR, 'index.html'));
}

function send(res: ServerResponse, file: string, status = 200): void {
  res.writeHead(status, {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    // Hashed Next assets are immutable; HTML must always revalidate.
    'Cache-Control': file.includes('/_next/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}

/**
 * Try to serve `urlPath` from out/. Returns true if a response was sent.
 * Resolution mirrors Next's trailingSlash export: /inbox → /inbox/index.html.
 */
export function serveStatic(req: IncomingMessage, res: ServerResponse, urlPath: string): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const clean = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  if (clean.includes('\0')) return false;

  if (!uiBuilt()) {
    if (clean === '/' || clean === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<!doctype html><meta charset="utf-8"><title>Xanî</title>' +
          '<body style="font-family:system-ui;max-width:34rem;margin:4rem auto;line-height:1.6">' +
          '<h1>Xanî runtime is up — the interface isn’t built yet</h1>' +
          '<p>Run <code>npm run app:build</code> in the <code>xani</code> folder once, then reload this page.</p>',
      );
      return true;
    }
    return false;
  }

  // Path-traversal guard: the normalized path must stay inside OUT_DIR.
  const rel = normalize(clean).replace(/^([/\\])+/, '');
  const base = join(OUT_DIR, rel);
  if (!base.startsWith(OUT_DIR)) return false;

  for (const candidate of [base, join(base, 'index.html'), `${base}.html`]) {
    try {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        send(res, candidate);
        return true;
      }
    } catch {
      /* try the next candidate */
    }
  }

  const notFound = join(OUT_DIR, '404.html');
  if (existsSync(notFound)) {
    send(res, notFound, 404);
    return true;
  }
  return false;
}
