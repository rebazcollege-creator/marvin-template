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
import { tmpdir } from 'node:os';

const GEMINI_KEY = (): string => process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = (): string => process.env.GEMINI_MODEL || 'gemini-2.0-flash';

/** True when a Google AI key is configured — route model calls to Gemini. */
export function usingGemini(): boolean {
  return GEMINI_KEY().length > 0;
}

// ---- Claude Code CLI provider ------------------------------------------------

const CLAUDE_BIN = (): string => process.env.XANI_CLAUDE_BIN || 'claude';
/** Forced on when the user flips "Run AI through Claude Code" (Settings) or sets the env. */
function claudeForced(): boolean {
  const v = (process.env.XANI_USE_CLAUDE_CLI || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

let cliAvail: boolean | null = null;
/** Is the `claude` binary on PATH? Probed once (cached). */
export function claudeCliAvailable(): boolean {
  if (cliAvail !== null) return cliAvail;
  try {
    const r = spawnSync(CLAUDE_BIN(), ['--version'], { stdio: 'ignore', timeout: 8000 });
    cliAvail = r.status === 0;
  } catch {
    cliAvail = false;
  }
  return cliAvail;
}

/**
 * Decide which backend to use, given whether an Anthropic client exists. Precedence:
 * forced-CLI (explicit user choice) → Gemini key → Anthropic key → CLI as an automatic
 * fallback when nothing else is set → none.
 */
export function resolveProvider(hasAnthropic: boolean): 'cli' | 'gemini' | 'anthropic' | 'none' {
  const cli = claudeCliAvailable();
  if (claudeForced() && cli) return 'cli';
  if (usingGemini()) return 'gemini';
  if (hasAnthropic) return 'anthropic';
  if (cli) return 'cli';
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
    // Run in a neutral cwd so Claude Code doesn't load this project's CLAUDE.md into the task.
    const child = spawn(CLAUDE_BIN(), args, { env, cwd: tmpdir() });
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
      if (code !== 0) return reject(new Error(`claude cli exited ${code}: ${err.slice(0, 300)}`));
      try {
        const j = JSON.parse(out) as { result?: string };
        resolve(typeof j.result === 'string' ? j.result : out.trim());
      } catch {
        resolve(out.trim()); // plain-text output (no --output-format json)
      }
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
  const args = ['-p', '--output-format', 'json', '--model', cliModel(params.model)];
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
    .filter((c) => c.parts[0].text.trim().length > 0);

  const body = {
    ...(sys ? { system_instruction: { parts: [{ text: sys }] } } : {}),
    contents: contents.length ? contents : [{ role: 'user', parts: [{ text: '' }] }],
    generationConfig: { maxOutputTokens: params.max_tokens ?? 1024 },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL()}:generateContent?key=${encodeURIComponent(key)}`;
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  if (onText && text) onText(text);
  return text;
}
