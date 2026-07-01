'use client';

import { useEffect, useRef, useState } from 'react';
import { streamMarvin, transcribeAudio } from '@/lib/marvin-client';
import { composeStudioSystemPrompt } from '@/lib/context';
import { DEFAULT_SETTINGS, getSettings, saveSettings, type XaniSettings } from '@/lib/settings';
import { ensureStorageReady, readJson, writeJson, newId } from '@/lib/storage';
import { logActivity } from '@/lib/activity';
import { fetchBriefingData, invalidate, peekData, PATHS } from '@/lib/marvin-data';
import type { BriefingData } from '@/lib/marvin-protocol';
import { Collapsible } from '@/components/ui/Collapsible';

/**
 * LeadStories — Fact-Check cockpit.
 *
 * Purpose-built around Rebaz's real pipeline: emergency trend-drops from the
 * LeadStories Slack surface up top; the claim comes in as pasted text OR by
 * recording (mic → on-device transcription, audio never leaves the machine) —
 * mirroring "iPhone recording → transcription"; MARVIN drafts a structured
 * fact-check note (CLAIM / VERDICT / SOURCES / REASONING); the note is copied
 * out and pasted into TCS BY HAND.
 *
 * Hard rule preserved: this Studio drafts notes only and NEVER writes into TCS
 * (closed app, no API). Same drafting/history/controls contract as the shared
 * StudioWorkbench, specialised for the fact-check loop.
 */

type Run = { id: string; at: string; input: string; output: string; verdict: string };
type EmergItem = { workspace: string; text: string };

const STUDIO = 'leadstories' as const;
const HIST_KEY = 'xani.studio.leadstories.v1';

const VERDICT_STYLE: Record<string, string> = {
  True: 'bg-green-soft text-green-ink',
  False: 'bg-accent-soft text-accent',
  Misleading: 'bg-gold-soft text-[#8A5A1E]',
  Unverified: 'bg-surface-2 text-text-2',
};

function parseVerdict(out: string): string {
  const m = out.match(/VERDICT:\s*(True|False|Misleading|Unverified)/i);
  if (!m) return '';
  return m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
}

/** Rebaz's LeadStories shift: ~13:00–17:00 Berlin, Mon/Wed/Thu/Fri/Sat. */
function onShift(tz: string): boolean {
  try {
    const now = new Date();
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
    const hr = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(now));
    return ['Mon', 'Wed', 'Thu', 'Fri', 'Sat'].includes(wd) && hr >= 13 && hr < 17;
  } catch {
    return false;
  }
}

export function LeadStoriesStudio() {
  const [settings, setSettings] = useState<XaniSettings | null>(null);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [verdict, setVerdict] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<Run[]>([]);
  const [promptDraft, setPromptDraft] = useState('');

  // emergency trend-drops (LeadStories Slack)
  const [emerg, setEmerg] = useState<EmergItem[]>([]);
  const [slackConnected, setSlackConnected] = useState<boolean | null>(null);
  const [emgOffline, setEmgOffline] = useState(false);

  // recording → transcription
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recErr, setRecErr] = useState('');
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    ensureStorageReady().then(() => {
      const s = getSettings();
      setSettings(s);
      setPromptDraft(s.prompts[STUDIO]);
      setHistory(readJson<Run[]>(HIST_KEY, []));
    });
    loadEmergencies(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyEmerg(d: BriefingData) {
    setSlackConnected(d.connected.slack);
    setEmerg(d.slack.filter((s) => s.emergency).map((s) => ({ workspace: s.workspace, text: s.text })));
  }

  function loadEmergencies(refresh: boolean) {
    if (refresh) invalidate(PATHS.briefing);
    const cached = peekData<BriefingData>(PATHS.briefing);
    if (cached) applyEmerg(cached);
    fetchBriefingData().then((d) => {
      if (d) {
        setEmgOffline(false);
        applyEmerg(d);
      } else {
        setEmgOffline(true);
      }
    });
  }

  const tz = settings?.profile.timezone ?? 'Europe/Berlin';
  const shift = onShift(tz);

  // ── controls (prompt editing parity with StudioWorkbench) ──
  const promptDirty = settings ? promptDraft !== settings.prompts[STUDIO] : false;
  const promptIsDefault = promptDraft === DEFAULT_SETTINGS.prompts[STUDIO];
  const savePrompt = () => {
    if (!settings) return;
    const next = { ...settings, prompts: { ...settings.prompts, [STUDIO]: promptDraft } };
    saveSettings(next);
    setSettings(next);
  };

  // ── record → transcribe ──
  async function startRec() {
    setRecErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        setTranscribing(true);
        const res = await transcribeAudio(blob);
        setTranscribing(false);
        if (res.ok && res.text) {
          setInput((v) => (v ? v.trim() + '\n' : '') + res.text!.trim());
        } else {
          setRecErr(res.error ?? 'Transcription unavailable.');
        }
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch {
      setRecErr('Microphone unavailable — check permissions.');
    }
  }
  function stopRec() {
    mediaRef.current?.stop();
    setRecording(false);
  }

  // ── draft the fact-check note ──
  const run = async () => {
    const text = input.trim();
    if (!text || busy) return;
    await ensureStorageReady();
    setBusy(true);
    setOutput('');
    setVerdict('');
    setCopied(false);

    const model = getSettings().models.studio;
    const system = [{ type: 'text' as const, text: composeStudioSystemPrompt(STUDIO), cache: true }];

    let out = '';
    await streamMarvin({ model, system, messages: [{ role: 'user', content: text }] }, (e) => {
      if (e.type === 'text') {
        out += e.text;
        setOutput(out);
        setVerdict(parseVerdict(out));
      } else if (e.type === 'error') {
        out += (out ? '\n\n' : '') + `⚠ ${e.message}`;
        setOutput(out);
      }
    });
    setBusy(false);

    if (out.trim()) {
      const v = parseVerdict(out);
      const runItem: Run = { id: newId(), at: new Date().toISOString(), input: text, output: out, verdict: v };
      const next = [runItem, ...history].slice(0, 30);
      setHistory(next);
      writeJson(HIST_KEY, next);
      logActivity({ kind: 'note', title: 'Fact-check drafted', detail: text.slice(0, 80), tag: v || undefined });
    }
  };

  const copy = () => {
    void navigator.clipboard?.writeText(output);
    setCopied(true);
  };

  return (
    <div className="mx-auto max-w-3xl px-8 pb-16 pt-7">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text">LeadStories — Fact-Check</h1>
          <p className="mt-1 text-[13px] text-muted">Studio · English only · drafts only · never writes to TCS</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
            shift ? 'bg-green-soft text-green-ink' : 'bg-surface-2 text-muted'
          }`}
          title="LeadStories shift: ~13:00–17:00, Mon/Wed/Thu/Fri/Sat"
        >
          {shift ? '● On shift' : 'Off shift'}
        </span>
      </div>

      {/* Emergency trend-drops — the LeadStories Slack judgement, surfaced first */}
      <section className="mt-5 rounded-2xl border border-border bg-surface p-4">
        <div className="mb-2.5 flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Emergency trend-drops</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => loadEmergencies(true)}
            className="text-[11.5px] font-semibold text-text-2 hover:text-accent"
          >
            Refresh
          </button>
        </div>
        {emgOffline ? (
          <p className="text-[12.5px] text-muted">Runtime offline — start it (npm run sidecar) to see live LeadStories alerts.</p>
        ) : slackConnected === false ? (
          <p className="text-[12.5px] text-muted">Connect Slack to see emergency trend-drops from the editors.</p>
        ) : emerg.length === 0 ? (
          <p className="text-[12.5px] text-text-2">No emergency trend-drops right now. Xanî is watching.</p>
        ) : (
          <ul className="space-y-2">
            {emerg.map((e, i) => (
              <li key={i} className="flex items-start gap-2.5 rounded-[10px] border border-accent/30 bg-accent-soft px-3 py-2.5">
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">{e.workspace}</div>
                  <button
                    type="button"
                    onClick={() => setInput(e.text)}
                    className="mt-0.5 block text-left text-[13px] leading-snug text-text hover:text-accent"
                    title="Load into the fact-check pipeline"
                  >
                    {e.text}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Controls (progressive disclosure) */}
      <div className="mt-5">
        <Collapsible
          title="Controls"
          summary={`Model ${settings?.models.studio ?? '…'} · Gmail · Slack · Web${promptDirty ? ' · prompt edited (unsaved)' : ''}`}
        >
          <div className="space-y-3">
            <div className="mb-1.5 flex items-center">
              <span className="flex-1 text-[12px] font-semibold text-text-2">System prompt</span>
              <button
                type="button"
                onClick={() => setPromptDraft(DEFAULT_SETTINGS.prompts[STUDIO])}
                disabled={promptIsDefault}
                className="text-[11.5px] font-semibold text-text-2 hover:text-accent disabled:opacity-40"
              >
                Reset to default
              </button>
            </div>
            <textarea
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              className="min-h-32 w-full resize-y rounded-[10px] border border-border bg-bg px-3 py-2.5 font-mono text-[12px] leading-relaxed text-text outline-none focus:border-accent"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={savePrompt}
                disabled={!promptDirty}
                className="rounded-[9px] bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-on-accent hover:bg-accent-dim disabled:opacity-40"
              >
                Save prompt
              </button>
              <span className="text-[11.5px] text-muted">Locked safety rules (English only, no TCS writes) are always appended.</span>
            </div>
          </div>
        </Collapsible>
      </div>

      {/* Claim input — paste or record */}
      <label className="mt-5 block">
        <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.07em] text-muted">
          Claim text or TikTok video description
        </span>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste the claim or video description — or record and I’ll transcribe it…"
          className="min-h-32 w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-[13.5px] leading-relaxed text-text outline-none focus:border-accent"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!recording ? (
          <button
            type="button"
            onClick={() => void startRec()}
            disabled={transcribing}
            className="flex items-center gap-1.5 rounded-[9px] border border-border bg-bg px-3 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-hover disabled:opacity-40"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M6 11a6 6 0 0 0 12 0M12 17v4" />
            </svg>
            {transcribing ? 'Transcribing…' : 'Record'}
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRec}
            className="flex items-center gap-1.5 rounded-[9px] border border-accent bg-accent-soft px-3 py-1.5 text-[12.5px] font-semibold text-accent"
          >
            <span className="h-2.5 w-2.5 rounded-[2px] bg-accent" style={{ animation: 'pulse 1.4s infinite' }} />
            Stop recording
          </button>
        )}
        <span className="text-[11.5px] text-muted">Audio is transcribed on-device — it never leaves your machine.</span>
      </div>
      {recErr && <p className="mt-2 text-[12px] text-accent">{recErr}</p>}

      <button
        type="button"
        onClick={() => void run()}
        disabled={busy || input.trim().length === 0}
        className="mt-4 rounded-[10px] bg-accent px-5 py-2 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? 'Checking…' : 'Fact-check'}
      </button>

      {output && (
        <section className="mt-7 rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Fact-check note</h2>
              {verdict && (
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${VERDICT_STYLE[verdict] ?? 'bg-surface-2 text-text-2'}`}>
                  {verdict}
                </span>
              )}
            </div>
            <button type="button" onClick={copy} className="text-[12px] font-semibold text-text-2 hover:text-accent">
              {copied ? 'Copied — paste into TCS' : 'Copy for TCS'}
            </button>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-[13.5px] leading-relaxed text-text">{output}</p>
          <p className="mt-4 border-t border-border pt-3 text-[11.5px] text-muted">
            Xanî never writes to TCS — copy this note and paste it in by hand.
          </p>
        </section>
      )}

      {history.length > 0 && (
        <section className="mt-8">
          <div className="mb-2.5 text-[11px] font-bold tracking-[0.08em] text-muted">RUN HISTORY ({history.length})</div>
          <ul className="space-y-2">
            {history.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOutput(r.output);
                    setInput(r.input);
                    setVerdict(r.verdict);
                    setCopied(false);
                  }}
                  className="block w-full rounded-[12px] border border-border bg-surface p-3.5 text-left transition hover:bg-hover"
                >
                  <div className="flex items-center gap-2">
                    {r.verdict && (
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${VERDICT_STYLE[r.verdict] ?? 'bg-surface-2 text-text-2'}`}>
                        {r.verdict}
                      </span>
                    )}
                    <span className="truncate text-[13px] font-medium text-text">{r.input}</span>
                    <span className="shrink-0 pl-3 text-[11.5px] text-muted">
                      {new Date(r.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
