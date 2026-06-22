import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Minimal .env loader (no dependency). Loads .env.local then .env from the xani
 * project root so you don't have to paste the API key on the command line. Real
 * shell env always wins (we never overwrite an already-set variable).
 *
 * In the packaged app the key comes from the OS keychain via Tauri, not a file.
 */
export function loadDotenv(cwd: string = process.cwd()): void {
  for (const file of ['.env.local', '.env']) {
    let text: string;
    try {
      text = readFileSync(resolve(cwd, file), 'utf8');
    } catch {
      continue; // file absent — fine
    }
    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      if (!key || key in process.env) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}
