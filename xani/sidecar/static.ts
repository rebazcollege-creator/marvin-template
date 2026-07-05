import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs';
import { join, normalize, extname, sep } from 'node:path';
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

function send(res: ServerResponse, file: string, status = 200, injectToken?: string): void {
  const type = MIME[extname(file)] ?? 'application/octet-stream';
  // Same-origin token delivery: inject the sidecar's per-boot kv token into the app's
  // own HTML so the renderer can authenticate its /kv calls. HTML is served WITHOUT
  // CORS headers (see the static branch in server.ts), so a cross-origin page cannot
  // read this token out of the response.
  if (injectToken && type.startsWith('text/html')) {
    try {
      const html = readFileSync(file, 'utf8').replace(
        /<\/head>/i,
        `<meta name="xani-kv-token" content="${injectToken}"></head>`,
      );
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
      res.end(html);
      return;
    } catch {
      /* fall through to streaming the file unmodified */
    }
  }
  res.writeHead(status, {
    'Content-Type': type,
    // Hashed Next assets are immutable; HTML must always revalidate.
    'Cache-Control': file.includes('/_next/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}

/**
 * Try to serve `urlPath` from out/. Returns true if a response was sent.
 * Resolution mirrors Next's trailingSlash export: /inbox → /inbox/index.html.
 * `kvToken`, when given, is injected into served HTML for same-origin kv auth.
 */
export function serveStatic(req: IncomingMessage, res: ServerResponse, urlPath: string, kvToken?: string): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  let clean: string;
  try {
    clean = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  } catch {
    return false; // a malformed %-escape (e.g. /%c0) must not throw and crash the runtime
  }
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

  // Path-traversal guard: the normalized path must stay inside OUT_DIR. The boundary
  // separator matters — a bare startsWith(OUT_DIR) would also match a SIBLING like
  // "outEVIL/" (…/xani/outEVIL starts with …/xani/out), so "../outEVIL/x" would pass.
  const rel = normalize(clean).replace(/^([/\\])+/, '');
  const base = join(OUT_DIR, rel);
  if (base !== OUT_DIR && !base.startsWith(OUT_DIR + sep)) return false;

  for (const candidate of [base, join(base, 'index.html'), `${base}.html`]) {
    try {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        send(res, candidate, 200, kvToken);
        return true;
      }
    } catch {
      /* try the next candidate */
    }
  }

  const notFound = join(OUT_DIR, '404.html');
  if (existsSync(notFound)) {
    send(res, notFound, 404, kvToken);
    return true;
  }
  return false;
}
