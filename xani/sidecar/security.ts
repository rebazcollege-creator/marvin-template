/**
 * Sidecar request origin allowlist.
 *
 * The sidecar owns every secret and can send mail / post to Slack as Rebaz. It
 * must therefore only answer the app itself, not any random web page the browser
 * has open. A browser always attaches an `Origin` header on cross-origin requests
 * and cannot forge it, so an origin allowlist checked ON THE SERVER genuinely
 * blocks a drive-by page from firing `/act` or reading `/data` — CORS response
 * headers alone do not (they only stop the page reading the reply, not sending
 * the request).
 *
 * Requests with NO Origin (curl, native tooling, some same-origin GETs) are
 * allowed for now: distinguishing our own app from other local processes needs a
 * shared spawn-time token, which is the planned next step. Loopback binding
 * (127.0.0.1) already removes the whole local network from reach.
 */

/** Origins the Xanî UI is served from. */
export const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  'http://localhost:3000', // next dev
  'http://127.0.0.1:3000',
  'http://localhost:8787', // single-port service mode: the sidecar serves the UI itself
  'http://127.0.0.1:8787',
  'tauri://localhost', // packaged app (macOS / Linux)
  'http://tauri.localhost', // packaged app (Windows)
  'https://tauri.localhost',
]);

/**
 * True if a request bearing this Origin may be served. A missing/empty Origin is
 * allowed (non-browser or same-origin); a present Origin must be on the allowlist.
 */
export function originAllowed(origin: string | undefined | null): boolean {
  if (!origin) return true;
  return ALLOWED_ORIGINS.has(origin);
}
