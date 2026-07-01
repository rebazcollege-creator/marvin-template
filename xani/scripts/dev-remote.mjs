/**
 * Remote/all-in-one launcher: UI (next dev) + runtime (sidecar) + the single-port proxy,
 * for running Xanî on a cloud box (GitHub Codespaces, a VPS) or your LAN and opening it
 * from another device — your phone.
 *
 *   npm run dev:remote
 *
 * Then forward/expose ONE port (default 8080, the proxy) and open that URL on your phone.
 * Everything (UI + AI) is reached through that single origin. See docs/PHONE.md.
 */
import { spawn } from 'node:child_process';

const PROXY_PORT = process.env.PORT || '8080';

const procs = [
  { name: 'ui     ', color: '\x1b[38;5;208m', cmd: 'npm', args: ['run', 'dev'] },
  { name: 'runtime', color: '\x1b[38;5;71m', cmd: 'npm', args: ['run', 'sidecar'] },
  { name: 'proxy  ', color: '\x1b[38;5;33m', cmd: 'node', args: ['scripts/serve-remote.mjs'] },
];

const reset = '\x1b[0m';
const children = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      c.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => process.exit(code), 400);
}

for (const p of procs) {
  const child = spawn(p.cmd, p.args, { shell: process.platform === 'win32' });
  children.push(child);
  const prefix = (line) => `${p.color}[${p.name}]${reset} ${line}`;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) out.write(prefix(line) + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    process.stdout.write(prefix(`exited (${code})`) + '\n');
    shutdown(code ?? 0);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

process.stdout.write(
  `\x1b[38;5;208mXanî\x1b[0m remote — open the forwarded port \x1b[1m${PROXY_PORT}\x1b[0m on your phone. Ctrl+C stops all.\n`,
);
