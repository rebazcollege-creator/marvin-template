/**
 * Model provider switch — Xanî can run its AI on any of three backends so it never
 * depends on one billing path:
 *
 *   1. Claude Code CLI  — runs the AI through the `claude` binary you're already
 *      logged into (your Claude subscription). NO API key, NO credits, NO Gemini key.
 *      Turn it on with XANI_USE_CLAUDE_CLI=1 (or the Settings toggle). This is the
 *      "get rid of the API-key problem" path.
 *   2. Google AI Studio (Gemini) — set GOOGLE_AI_API_KEY / GEMINI_API_KEY.
 *   3. Anthropic API — set ANTHROPIC_API_KEY.
 *
 * All three are text-only for triage/drafting/summaries/chat; custom tool loops
 * degrade to a plain answer, but every visible feature (triage + drafts) works fully.
 */

import { spawn, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const GEMINI_KEY = (): string => process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = (): string => process.env.GEMINI_MODEL || 'gemini-2.0-flash';

/** True when a Google AI key is configured — route model calls to Gemini. */
export function usingGemini(): boolean {
  return GEMINI_KEY().length > 0;
}

// ---- Claude Code CLI provider ------------------------------------------------

/** Standard places the `claude` binary lands, so we don't depend on the sidecar's PATH
 *  (npm-spawned processes often lack ~/.local/bin, Homebrew, etc.). */
function claudeCandidates(): string[] {
  const home = homedir();
  return [
    process.env.XANI_CLAUDE_BIN || '',
    'claude', // whatever's on PATH
    join(home, '.local/bin/claude'), // native installer (claude.ai/install.sh)
    join(home, '.claude/local/claude'),
    '/opt/homebrew/bin/claude', // Apple-silicon Homebrew
    '/usr/local/bin/claude', // Intel Homebrew / npm -g
    join(home, '.npm-global/bin/claude'),
    join(home, '.bun/bin/claude'),
  ].filter(Boolean);
}

let cliBin: string | null | undefined; // undefined = not probed, null = not found
/** Find a working `claude` binary once (cached). Tries PATH then the standard install dirs. */
function resolveClaudeBin(): string | null {
  if (cliBin !== undefined) return cliBin;
  for (const cand of claudeCandidates()) {
    // An absolute path must exist on disk; a bare "claude" is resolved via PATH by spawnSync.
    if (cand.includes('/') && !existsSync(cand)) continue;
    try {
      const r = spawnSync(cand, ['--version'], { stdio: 'ignore', timeout: 8000 });
      if (r.status === 0) {
        cliBin = cand;
        return cliBin;
      }
    } catch {
      /* try the next candidate */
    }
  }
  cliBin = null;
  return cliBin;
}

const CLAUDE_BIN = (): string => resolveClaudeBin() ?? 'claude';

/** Explicit opt-OUT: set XANI_USE_CLAUDE_CLI=0/false to stop preferring the CLI. */
function claudeDisabled(): boolean {
  const v = (process.env.XANI_USE_CLAUDE_CLI ?? '').toLowerCase();
  return v === '0' || v === 'false' || v === 'no' || v === 'off';
}

/** Explicit opt-IN (the Settings toggle): the user deliberately chose the CLI. */
function claudeForcedOn(): boolean {
  const v = (process.env.XANI_USE_CLAUDE_CLI ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** Is a usable `claude` binary present? Probed once (cached). */
export function claudeCliAvailable(): boolean {
  return resolveClaudeBin() !== null;
}

/**
 * Decide which backend to use.
 *
 * Order matters: the CLI path is TEXT-ONLY (no tool use, no streaming), so a
 * configured Anthropic API key — a deliberate, paid choice with full capability —
 * must not be silently overridden just because the `claude` binary happens to be
 * installed. Explicit choices always win:
 *   XANI_AI_PROVIDER=cli|gemini|anthropic  → forced
 *   XANI_USE_CLAUDE_CLI=1                  → CLI (the Settings toggle)
 * Then: Anthropic key → Gemini key → CLI-if-installed (the no-key default) → none.
 */
export function resolveProvider(hasAnthropic: boolean): 'cli' | 'gemini' | 'anthropic' | 'none' {
  const forced = (process.env.XANI_AI_PROVIDER || '').toLowerCase();
  const cli = claudeCliAvailable();
  if (forced === 'cli') return cli ? 'cli' : 'none';
  if (forced === 'gemini') return usingGemini() ? 'gemini' : 'none';
  if (forced === 'anthropic') return hasAnthropic ? 'anthropic' : 'none';
  if (cli && claudeForcedOn()) return 'cli'; // the user's explicit toggle
  if (hasAnthropic) return 'anthropic'; // full-capability key beats silent CLI preference
  if (usingGemini()) return 'gemini';
  if (cli && !claudeDisabled()) return 'cli'; // the no-key default when nothing else is set
  return 'none';
}

/** Map an Anthropic model id to a CLI --model alias the logged-in plan understands. */
function cliModel(model?: string): string {
  if (process.env.XANI_CLAUDE_CLI_MODEL) return process.env.XANI_CLAUDE_CLI_MODEL;
  const m = (model || '').toLowerCase();
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  return 'haiku'; // triage/drafts default — fast + cheap on the subscription
}

/** Spawn `claude -p`, feed the prompt on stdin, return the assistant text. */
function runClaude(args: string[], input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Strip Anthropic API-key env so the CLI authenticates with the logged-in Claude
    // subscription (OAuth) instead of a stale/dead ANTHROPIC_API_KEY — otherwise the CLI
    // tries the key first and 401s ("Please run /login") even when you're signed in.
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
    // Run in the user's HOME, not a temp dir: Claude Code shows a one-time "trust this
    // folder" prompt for unknown dirs, and in headless (-p) mode it can't answer it and
    // exits 1. Home is trusted on first interactive run, so -p works. (tmpdir is never
    // trusted → every call failed.) Home has no project CLAUDE.md to pollute the task.
    const child = spawn(CLAUDE_BIN(), args, { env, cwd: homedir() });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('claude cli timed out'));
    }, 120_000);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      // Claude -p writes its own error to STDOUT (as JSON) on failure — surface both streams.
      let j: { result?: string; is_error?: boolean; error?: string; subtype?: string } | null = null;
      try {
        j = JSON.parse(out);
      } catch {
        /* not JSON */
      }
      if (code !== 0 || j?.is_error) {
        const detail = (j?.error || j?.result || j?.subtype || err || out || '(no output)').toString().slice(0, 400);
        return reject(new Error(`claude cli exited ${code}: ${detail}`));
      }
      if (j && typeof j.result === 'string') return resolve(j.result);
      resolve(out.trim()); // plain-text output (no --output-format json)
    });
    child.stdin.write(input);
    child.stdin.end();
  });
}

/**
 * Run one generation through the Claude Code CLI (your logged-in subscription).
 * Flattens the Anthropic-shaped system + messages into a single prompt (text-only).
 */
export async function claudeCliGenerate(
  params: { system?: unknown; messages: { role: string; content: unknown }[]; max_tokens?: number; model?: string },
  onText?: (t: string) => void,
): Promise<string> {
  const sys = flattenSystem(params.system);
  const convo = params.messages
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${textOf(m.content)}`)
    .filter((l) => l.trim().length > 3)
    .join('\n\n');
  const prompt = [sys, convo].filter(Boolean).join('\n\n---\n\n') || ' ';
  // --strict-mcp-config with no --mcp-config = load NO MCP servers: much faster cold start
  // and avoids the "1 setup issue: MCP" hang, since triage/drafts never need tools anyway.
  const args = ['-p', '--output-format', 'json', '--strict-mcp-config', '--model', cliModel(params.model)];
  const text = await runClaude(args, prompt);
  if (onText && text) onText(text);
  return text;
}

/** Flatten Anthropic-style system (string or SystemBlock[]) to plain text. */
function flattenSystem(system: unknown): string {
  if (typeof system === 'string') return system;
  if (Array.isArray(system)) return system.map((b) => (b as { text?: string })?.text ?? '').join('\n\n');
  return '';
}

/** Extract plain text from an Anthropic message content (string or block[]). */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        const blk = b as { type?: string; text?: string; content?: unknown };
        if (typeof b === 'string') return b;
        if (blk.type === 'text') return blk.text ?? '';
        if (blk.type === 'tool_result') {
          return typeof blk.content === 'string'
            ? blk.content
            : Array.isArray(blk.content)
              ? blk.content.map((c) => (c as { text?: string })?.text ?? '').join('\n')
              : '';
        }
        return '';
      })
      .join('\n');
  }
  return '';
}

/**
 * Run one generation on Gemini from Anthropic-shaped params. Returns the text; calls
 * onText once with the full text (so streaming callers still get their output).
 */
export async function geminiGenerate(
  params: { system?: unknown; messages: { role: string; content: unknown }[]; max_tokens?: number },
  onText?: (t: string) => void,
): Promise<string> {
  const key = GEMINI_KEY();
  if (!key) throw new Error('No Google AI key set.');
  const sys = flattenSystem(params.system);
  const contents = params.messages
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: textOf(m.content) }] }))
    .filter((c) => (c.parts[0]?.text ?? '').trim().length > 0);

  const body = {
    ...(sys ? { system_instruction: { parts: [{ text: sys }] } } : {}),
    contents: contents.length ? contents : [{ role: 'user', parts: [{ text: '' }] }],
    generationConfig: { maxOutputTokens: params.max_tokens ?? 1024 },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL()}:generateContent?key=${encodeURIComponent(key)}`;
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  if (onText && text) onText(text);
  return text;
}
