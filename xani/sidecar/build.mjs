// Compiles the Node sidecar into a single self-contained binary with Bun, named
// for the host Rust target triple so Tauri's `externalBin` picks it up.
//
//   node sidecar/build.mjs        (run via `npm run sidecar:build`)
//
// Requires Bun on the build machine. Output: src-tauri/binaries/xani-sidecar-<triple>[.exe]
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

function hostTriple() {
  try {
    const out = execSync('rustc -vV', { encoding: 'utf8' });
    const m = out.match(/host:\s*(\S+)/);
    if (m) return m[1];
  } catch {
    /* rustc not on PATH — fall back to platform/arch */
  }
  const { platform, arch } = process;
  if (platform === 'darwin') return arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  if (platform === 'win32') return 'x86_64-pc-windows-msvc';
  return arch === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu';
}

const BUN_TARGET = {
  'aarch64-apple-darwin': 'bun-darwin-arm64',
  'x86_64-apple-darwin': 'bun-darwin-x64',
  'x86_64-unknown-linux-gnu': 'bun-linux-x64',
  'aarch64-unknown-linux-gnu': 'bun-linux-arm64',
  'x86_64-pc-windows-msvc': 'bun-windows-x64',
};

const triple = hostTriple();
const ext = triple.includes('windows') ? '.exe' : '';
const outfile = `src-tauri/binaries/xani-sidecar-${triple}${ext}`;
const targetFlag = BUN_TARGET[triple] ? `--target=${BUN_TARGET[triple]}` : '';

mkdirSync('src-tauri/binaries', { recursive: true });
console.log(`Building sidecar → ${outfile}`);
execSync(`bun build sidecar/server.ts --compile ${targetFlag} --outfile ${outfile}`, {
  stdio: 'inherit',
});
console.log('Sidecar binary ready.');
