import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Sidecar-owned data directory — the permanent home of Xanî's state.
 *
 * Until Phase 0, everything lived in the repo working directory (.xani-*.json) and
 * the browser's localStorage: one `rm -rf`, disk failure, or "Clear site data" from
 * losing credentials and the assistant's whole memory. All state now lives in the
 * OS-conventional per-user application directory, owned by the sidecar:
 *
 *   macOS:  ~/Library/Application Support/Xani
 *   Linux:  $XDG_DATA_HOME/xani  (or ~/.local/share/xani)
 *   Win:    %APPDATA%\Xani
 *
 * XANI_DATA_DIR overrides (tests, portable setups). Legacy files in the working
 * directory are migrated (copied, not deleted) on first boot, so an existing dev
 * setup keeps its creds/voice/triage state with zero manual steps.
 */

function defaultDataDir(): string {
  if (process.env.XANI_DATA_DIR) return process.env.XANI_DATA_DIR;
  const home = homedir();
  if (process.platform === 'darwin') return join(home, 'Library', 'Application Support', 'Xani');
  if (process.platform === 'win32') return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Xani');
  return join(process.env.XDG_DATA_HOME ?? join(home, '.local', 'share'), 'xani');
}

export const DATA_DIR = defaultDataDir();
export const BACKUPS_DIR = join(DATA_DIR, 'backups');
export const LOGS_DIR = join(DATA_DIR, 'logs');

export const CREDS_FILE = join(DATA_DIR, 'creds.json');
export const KV_FILE = join(DATA_DIR, 'kv.json');
export const VOICE_CORPUS_FILE = join(DATA_DIR, 'voice-corpus.json');
export const VOICE_ANALYSIS_FILE = join(DATA_DIR, 'voice-analysis.json');
export const TRIAGE_CACHE_FILE = join(DATA_DIR, 'triage-cache.json');

for (const dir of [DATA_DIR, BACKUPS_DIR, LOGS_DIR]) {
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch {
    /* an unwritable dir surfaces at first persist, with the real error */
  }
}

/** cwd-relative legacy file → its new home. Copy (never delete) if the new one is absent. */
const LEGACY: [string, string][] = [
  ['.xani-creds.json', CREDS_FILE],
  ['.xani-voice-corpus.json', VOICE_CORPUS_FILE],
  ['.xani-voice-analysis.json', VOICE_ANALYSIS_FILE],
  ['.xani-triage-cache.json', TRIAGE_CACHE_FILE],
];

/** One-time, idempotent migration from the old repo-folder files. Safe to call every boot. */
export function migrateLegacyFiles(): string[] {
  const migrated: string[] = [];
  for (const [legacy, target] of LEGACY) {
    const src = join(process.cwd(), legacy);
    try {
      if (existsSync(src) && !existsSync(target)) {
        copyFileSync(src, target);
        migrated.push(legacy);
      }
    } catch {
      /* keep booting — the legacy file still works via its consumer's fallback */
    }
  }
  return migrated;
}
