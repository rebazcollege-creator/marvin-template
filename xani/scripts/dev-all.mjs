/**
 * One-command dev launcher: starts the UI (next dev) and the runtime (sidecar)
 * together, with prefixed output, and shuts both down cleanly on Ctrl+C.
 *
 *   npm run dev:all
 *
 * No extra dependencies — just Node's child_process. This is a dev convenience;
 * the packaged desktop app spawns the sidecar itself, so end users never do this.
 */
import { spawn } from 'node:child_process';

const procs = [
  { name: 'ui    ', color: '\x1b[38;5;208m', cmd: 'npm', args: ['run', 'dev'] },
  { name: 'runtime', color: '\x1b[38;5;71m', cmd: 'npm', args: ['run', 'sidecar'] },
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
  // Give them a moment to exit, then force.
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

process.stdout.write('\x1b[38;5;208mXanî\x1b[0m dev — UI on http://localhost:3000, runtime on http://localhost:8787. Ctrl+C stops both.\n');
