#!/usr/bin/env node
/**
 * Install Xanî as a self-running background service on macOS (launchd).
 *
 * This replaces the daily terminal ritual. After running this ONCE:
 *   - Xanî starts by itself when you log in
 *   - if it crashes, macOS restarts it automatically (KeepAlive)
 *   - the whole app lives at  http://localhost:8787  — bookmark it / add to Dock
 *   - no `git pull`, no `rm -rf .next`, no `npm run dev:all`
 *
 * Usage, from the xani/ folder:
 *   npm run service:install      # build the interface + install + start
 *   npm run service:uninstall    # stop and remove the service
 *
 * Logs land in ~/Library/Application Support/Xani/logs/ if you ever need them.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LABEL = 'com.xani.runtime';
const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLIST = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const DATA_DIR = process.env.XANI_DATA_DIR ?? join(homedir(), 'Library', 'Application Support', 'Xani');
const LOG_DIR = join(DATA_DIR, 'logs');

const say = (m) => console.log(m);
const die = (m) => {
  console.error(`\n✗ ${m}`);
  process.exit(1);
};

if (process.platform !== 'darwin') die('This installer is for macOS. On other systems, run `npm run app` manually or use any process supervisor.');

const uid = process.getuid?.() ?? 501;
const domain = `gui/${uid}`;
const uninstall = process.argv.includes('--uninstall');

function launchctl(args, ignoreFailure = true) {
  const r = spawnSync('launchctl', args, { encoding: 'utf8' });
  if (r.status !== 0 && !ignoreFailure) die(`launchctl ${args[0]} failed: ${(r.stderr || r.stdout || '').trim()}`);
  return r.status === 0;
}

if (uninstall) {
  launchctl(['bootout', `${domain}/${LABEL}`]);
  try { rmSync(PLIST); } catch { /* already gone */ }
  say('✓ Xanî background service removed. (Your data and credentials are untouched.)');
  process.exit(0);
}

// 1) Build the interface fresh — an existing out/ may be WEEKS stale, and serving it
//    would silently run an old app. --skip-build only if you know it's current.
if (!process.argv.includes('--skip-build')) {
  say('Building the interface (this takes a minute)…');
  const b = spawnSync('npm', ['run', 'app:build'], { cwd: APP_ROOT, stdio: 'inherit' });
  if (b.status !== 0) die('The interface build failed — scroll up for the error, or ask MARVIN’s developer session for help.');
} else if (!existsSync(join(APP_ROOT, 'out', 'index.html'))) {
  die('--skip-build was passed but out/ has no build. Run without --skip-build.');
}

// 2) Write the launchd job. process.execPath = the exact node that ran this script,
//    so a Homebrew/nvm PATH difference can never break the service.
mkdirSync(dirname(PLIST), { recursive: true });
mkdirSync(LOG_DIR, { recursive: true });
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${join(APP_ROOT, 'sidecar', 'server.ts')}</string>
  </array>
  <key>WorkingDirectory</key><string>${APP_ROOT}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${join(LOG_DIR, 'runtime.log')}</string>
  <key>StandardErrorPath</key><string>${join(LOG_DIR, 'runtime-error.log')}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${dirname(process.execPath)}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>HOME</key><string>${homedir()}</string>
  </dict>
</dict>
</plist>
`;
writeFileSync(PLIST, plist);

// 3) (Re)start it. bootout first so re-running the installer is always safe.
launchctl(['bootout', `${domain}/${LABEL}`]);
if (!launchctl(['bootstrap', domain, PLIST])) {
  // Older macOS fallback.
  launchctl(['unload', PLIST]);
  launchctl(['load', '-w', PLIST], false);
}
launchctl(['kickstart', '-k', `${domain}/${LABEL}`]);

// 4) Verify it actually came up.
say('Starting Xanî…');
let up = false;
for (let i = 0; i < 20 && !up; i++) {
  try {
    execFileSync('curl', ['-sf', '--max-time', '1', 'http://127.0.0.1:8787/health'], { stdio: 'ignore' });
    up = true;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}

if (up) {
  say('');
  say('✓ Xanî is now a background service.');
  say('');
  say('  Open the app:   http://localhost:8787   (bookmark it, or File → Add to Dock in Safari)');
  say('  It starts by itself when you log in, and restarts itself if it ever crashes.');
  say('  Your old terminal ritual is retired — no git pull, no rm -rf, no npm run dev:all.');
  say('');
} else {
  die(`The service installed but didn’t answer on port 8787. Check the log: ${join(LOG_DIR, 'runtime-error.log')}`);
}
