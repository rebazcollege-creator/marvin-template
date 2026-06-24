'use client';

import { useEffect, useRef, useState } from 'react';
import { ensureStorageReady } from '@/lib/storage';
import {
  listSessions,
  saveSessions,
  newSession,
  newAction,
  type NoteSession,
  type ActionItem,
  type ActionDest,
} from '@/lib/notetaker';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { enqueueApproval } from '@/lib/approvals';
import { transcribeAudio } from '@/lib/marvin-client';

type Capture = 'off' | 'requesting' | 'recording' | 'denied';

function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const DEST_LABEL: Record<ActionDest, string> = { none: 'No destination', trello: 'Trello card', calendar: 'Calendar event' };

export default function NotetakerPage() {
  const [sessions, setSessions] = useState<NoteSession[]>([]);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [capture, setCapture] = useState<Capture>('off');
  const [agenda, setAgenda] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [draftAction, setDraftAction] = useState('');
  const [routing, setRouting] = useState<{ session: NoteSession; action: ActionItem } | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const startRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobsRef = useRef<Map<string, Blob>>(new Map());
  const pendingIdRef = useRef<string | null>(null);
  const [, setBlobTick] = useState(0);
  const [transcribeMsg, setTranscribeMsg] = useState('');

  useEffect(() => {
    ensureStorageReady().then(() => {
      setSessions(listSessions());
      setReady(true);
    });
    return () => teardown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = (next: NoteSession[]) => {
    setSessions(next);
    saveSessions(next);
  };
  const patchSession = (id: string, patch: Partial<NoteSession>) =>
    persist(sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  function teardown() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    ctxRef.current?.close().catch(() => {});
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    } catch {
      /* ignore */
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    timerRef.current = null;
    rafRef.current = null;
    ctxRef.current = null;
    streamRef.current = null;
  }

  const transcribe = async (session: NoteSession) => {
    const blob = blobsRef.current.get(session.id);
    if (!blob) {
      setTranscribeMsg('No audio for this session — audio is held only in memory and clears on reload.');
      return;
    }
    setTranscribeMsg('Transcribing on your device…');
    const r = await transcribeAudio(blob);
    if (r.ok && r.text) {
      patchSession(session.id, { notes: session.notes ? `${session.notes}\n\n${r.text}` : r.text });
      setTranscribeMsg('Transcript added to notes.');
    } else {
      setTranscribeMsg(r.error ?? 'Could not transcribe.');
    }
  };

  const start = async () => {
    setCapture('requesting');
    setAgenda('');
    setElapsed(0);
    setSelectedId(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      try {
        const rec = new MediaRecorder(stream);
        recorderRef.current = rec;
        chunksRef.current = [];
        rec.ondataavailable = (e) => {
          if (e.data && e.data.size) chunksRef.current.push(e.data);
        };
        rec.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
          if (pendingIdRef.current && blob.size) blobsRef.current.set(pendingIdRef.current, blob);
          setBlobTick((t) => t + 1);
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        };
        rec.start();
      } catch {
        /* recording without MediaRecorder still captures timing/notes */
      }
      try {
        const ctx = new AudioContext();
        ctxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = ((buf[i] ?? 128) - 128) / 128;
            sum += v * v;
          }
          setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 3));
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        /* level meter optional */
      }
      startRef.current = Date.now();
      timerRef.current = window.setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
      setCapture('recording');
    } catch {
      teardown();
      setCapture('denied');
    }
  };

  const stop = () => {
    const dur = elapsed;
    // Stop meters/timer now, but let the recorder flush (its onstop closes tracks)
    // so the captured audio is associated with the new session.
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    ctxRef.current?.close().catch(() => {});
    timerRef.current = null;
    rafRef.current = null;
    ctxRef.current = null;
    const s = newSession(agenda, dur);
    pendingIdRef.current = s.id;
    persist([s, ...sessions]);
    setSelectedId(s.id);
    setCapture('off');
    setLevel(0);
    setTranscribeMsg('');
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    } else {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const cancelCapture = () => {
    teardown();
    setCapture('off');
    setLevel(0);
  };

  const selected = sessions.find((s) => s.id === selectedId) ?? null;

  const addAction = () => {
    if (!selected || draftAction.trim().length === 0) return;
    patchSession(selected.id, { actions: [...selected.actions, newAction(draftAction.trim())] });
    setDraftAction('');
  };
  const updateAction = (sid: string, aid: string, patch: Partial<ActionItem>) => {
    const s = sessions.find((x) => x.id === sid);
    if (!s) return;
    patchSession(sid, { actions: s.actions.map((a) => (a.id === aid ? { ...a, ...patch } : a)) });
  };
  const confirmRoute = () => {
    if (!routing) return;
    const toTrello = routing.action.dest === 'trello';
    enqueueApproval({
      kind: toTrello ? 'task' : 'calendar',
      title: routing.action.text,
      source: `Notetaker · ${routing.session.title}`,
      preview: toTrello
        ? `Create a Trello card:\n${routing.action.text}`
        : `Create a calendar event:\n${routing.action.text}`,
      actionLabel: toTrello ? 'Create card' : 'Add to calendar',
      payload: toTrello
        ? { kind: 'task', name: routing.action.text }
        : { kind: 'calendar', title: routing.action.text },
    });
    updateAction(routing.session.id, routing.action.id, { routed: true });
  };

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="flex flex-none items-end gap-4 border-b border-border px-8 pb-4 pt-6">
        <div className="flex-1">
          <h1 className="font-display text-2xl font-semibold text-text">Notetaker</h1>
          <p className="mt-1 text-[13px] text-muted">
            On-device meeting notes — MARVIN captures the conversation into notes and actions. Nothing joins your calls.
          </p>
        </div>
        {capture === 'recording' ? (
          <button type="button" onClick={stop} className="flex items-center gap-2 rounded-[11px] border border-border bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text transition hover:bg-hover">
            <span className="h-2.5 w-2.5 rounded-sm bg-accent" />
            Stop · {fmtDur(elapsed)}
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={capture === 'requesting'}
            className="flex items-center gap-2 rounded-[11px] bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-on-accent transition hover:bg-accent-dim disabled:opacity-60"
          >
            <span className="h-2 w-2 rounded-full bg-on-accent" />
            {capture === 'requesting' ? 'Requesting mic…' : 'Start recording'}
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* meetings list */}
        <div className="w-[300px] flex-none overflow-y-auto border-r border-border p-3.5">
          <div className="mb-2 px-2 text-[11px] font-bold tracking-[0.08em] text-muted">MEETINGS</div>
          {!ready ? (
            <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="xsk h-12 rounded-xl" />)}</div>
          ) : sessions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
              <p className="text-[12.5px] font-medium text-text">No meetings yet</p>
              <p className="mt-1 text-[11.5px] text-muted">Press Start recording to capture one.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { setSelectedId(s.id); if (capture !== 'recording') setCapture('off'); }}
                  className={`block w-full rounded-xl px-3.5 py-3 text-left transition ${selectedId === s.id && capture !== 'recording' ? 'bg-accent-soft' : 'hover:bg-hover'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span className="truncate text-[13px] font-semibold text-text">{s.title}</span>
                  </div>
                  <div className="mt-1 pl-3.5 text-[11.5px] text-muted">{fmtWhen(s.startedAt)} · {fmtDur(s.durationSec)}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* right pane */}
        <div className="flex-1 overflow-y-auto px-8 py-7">
          <div className="max-w-[640px]">
            {capture === 'requesting' && (
              <Panel
                title="Waiting for microphone…"
                body="Your browser is asking permission to use the mic. Audio is processed on your device — nothing is uploaded."
                action={<button type="button" onClick={cancelCapture} className="rounded-[10px] border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-text-2 hover:bg-hover">Cancel</button>}
              />
            )}

            {capture === 'denied' && (
              <Panel
                title="Microphone access needed"
                body="To capture a meeting, allow microphone access in your browser or OS settings, then try again."
                action={
                  <div className="flex justify-center gap-2.5">
                    <button type="button" onClick={cancelCapture} className="rounded-[10px] border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-text-2 hover:bg-hover">Cancel</button>
                    <button type="button" onClick={start} className="rounded-[10px] bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent-dim">Try again</button>
                  </div>
                }
              />
            )}

            {capture === 'recording' && (
              <div>
                <div className="mb-5 flex items-center gap-3 rounded-[14px] border border-border bg-surface px-5 py-4">
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-accent" />
                  </span>
                  <div className="flex-1">
                    <div className="text-[13.5px] font-semibold text-text">Recording · {fmtDur(elapsed)}</div>
                    <div className="text-[11.5px] text-muted">Capturing agenda & timing on this device</div>
                  </div>
                  <div className="flex h-6 items-end gap-0.5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span key={i} className="w-1 rounded-sm bg-accent/70" style={{ height: `${Math.max(8, Math.min(100, level * 100 * (1 - Math.abs(i - 2) * 0.18)))}%` }} />
                    ))}
                  </div>
                </div>
                <div className="mb-2 text-[11px] font-bold tracking-[0.08em] text-muted">AGENDA / LIVE NOTES</div>
                <textarea
                  value={agenda}
                  onChange={(e) => setAgenda(e.target.value)}
                  placeholder="Jot the agenda and key points as you talk…"
                  className="min-h-44 w-full resize-y rounded-[12px] border border-border bg-surface px-4 py-3 text-[13.5px] leading-relaxed text-text outline-none focus:border-accent"
                />
                <p className="mt-3 rounded-[11px] border border-border bg-bg px-3.5 py-2.5 text-[11.5px] leading-relaxed text-muted">
                  On-device transcription isn’t enabled yet, so there’s no automatic transcript — your notes and timing are saved. When the local model lands, a speaker-labelled transcript and summary appear here automatically.
                </p>
              </div>
            )}

            {capture === 'off' && selected && (
              <Review
                session={selected}
                draftAction={draftAction}
                setDraftAction={setDraftAction}
                onAddAction={addAction}
                onUpdateAction={(aid, patch) => updateAction(selected.id, aid, patch)}
                onRoute={(a) => setRouting({ session: selected, action: a })}
                onTitle={(t) => patchSession(selected.id, { title: t })}
                onNotes={(n) => patchSession(selected.id, { notes: n })}
                onDelete={() => { persist(sessions.filter((s) => s.id !== selected.id)); setSelectedId(null); }}
                hasAudio={blobsRef.current.has(selected.id)}
                onTranscribe={() => void transcribe(selected)}
                transcribeMsg={transcribeMsg}
              />
            )}

            {capture === 'off' && !selected && (
              <>
                <Panel title="Your notes will appear here" body="Press Start recording to capture a meeting. You’ll get the agenda, timing, editable notes and action items you can route to Trello or Calendar." />
                <div className="mt-7 text-[11px] font-bold tracking-[0.08em] text-muted">HOW IT WORKS</div>
                <div className="mt-3 space-y-3">
                  {[
                    { n: 1, t: 'Agenda', b: 'Jot what the meeting is for and key points as you go.' },
                    { n: 2, t: 'Capture', b: 'Audio stays on your device; timing and notes are saved live.' },
                    { n: 3, t: 'Summary & actions', b: 'Afterwards, add action items and route them to Trello or Calendar — gated by Approvals.' },
                  ].map((s) => (
                    <div key={s.n} className="flex items-start gap-3 rounded-[14px] border border-border bg-surface p-4">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-bold text-accent">{s.n}</span>
                      <div>
                        <div className="text-[13.5px] font-semibold text-text">{s.t}</div>
                        <div className="mt-0.5 text-[12.5px] leading-relaxed text-text-2">{s.b}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={!!routing}
        title={routing ? `Route to ${routing.action.dest === 'trello' ? 'Trello' : 'Calendar'}` : ''}
        body={routing ? `MARVIN will prepare this as a ${routing.action.dest === 'trello' ? 'Trello card' : 'calendar event'}. It waits in Approvals before anything is created.` : ''}
        detail={routing?.action.text}
        okLabel="Send to Approvals"
        onConfirm={confirmRoute}
        onClose={() => setRouting(null)}
      />
    </div>
  );
}

function Panel({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-[16px] border border-dashed border-border bg-surface px-6 py-10 text-center">
      <p className="text-sm font-semibold text-text">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-text-2">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function Review({
  session,
  draftAction,
  setDraftAction,
  onAddAction,
  onUpdateAction,
  onRoute,
  onTitle,
  onNotes,
  onDelete,
  hasAudio,
  onTranscribe,
  transcribeMsg,
}: {
  session: NoteSession;
  draftAction: string;
  setDraftAction: (v: string) => void;
  onAddAction: () => void;
  onUpdateAction: (aid: string, patch: Partial<ActionItem>) => void;
  onRoute: (a: ActionItem) => void;
  onTitle: (t: string) => void;
  onNotes: (n: string) => void;
  onDelete: () => void;
  hasAudio: boolean;
  onTranscribe: () => void;
  transcribeMsg: string;
}) {
  return (
    <div>
      <input
        value={session.title}
        onChange={(e) => onTitle(e.target.value)}
        className="w-full bg-transparent font-display text-xl font-semibold text-text outline-none"
      />
      <div className="mt-1 text-[11.5px] text-muted">{fmtWhen(session.startedAt)} · {fmtDur(session.durationSec)} recorded</div>

      <div className="mt-6 text-[11px] font-bold tracking-[0.08em] text-muted">SUMMARY</div>
      <div className="mt-2 rounded-[12px] border border-dashed border-border bg-surface px-4 py-4 text-[12.5px] leading-relaxed text-muted">
        No automatic summary yet — on-device summarisation is coming. Capture the gist in your notes below.
      </div>

      {session.agenda && (
        <>
          <div className="mt-6 text-[11px] font-bold tracking-[0.08em] text-muted">AGENDA</div>
          <div className="mt-2 whitespace-pre-wrap rounded-[12px] border border-border bg-surface px-4 py-3 text-[13px] leading-relaxed text-text-2">{session.agenda}</div>
        </>
      )}

      <div className="mt-6 flex items-center gap-3">
        <span className="text-[11px] font-bold tracking-[0.08em] text-muted">NOTES</span>
        {hasAudio && (
          <button type="button" onClick={onTranscribe} className="flex items-center gap-1.5 rounded-[8px] border border-border bg-bg px-2.5 py-1 text-[11.5px] font-semibold text-text-2 hover:bg-hover">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4" /></svg>
            Transcribe (on-device)
          </button>
        )}
        {transcribeMsg && <span className="text-[11.5px] text-muted">{transcribeMsg}</span>}
      </div>
      <textarea
        value={session.notes}
        onChange={(e) => onNotes(e.target.value)}
        placeholder="Write up the meeting…"
        className="mt-2 min-h-28 w-full resize-y rounded-[12px] border border-border bg-surface px-4 py-3 text-[13px] leading-relaxed text-text outline-none focus:border-accent"
      />

      <div className="mt-6 text-[11px] font-bold tracking-[0.08em] text-muted">ACTION ITEMS</div>
      <div className="mt-2 space-y-2">
        {session.actions.map((a) => (
          <div key={a.id} className="flex items-center gap-3 rounded-[12px] border border-border bg-surface px-3.5 py-2.5">
            <button
              type="button"
              aria-pressed={a.done}
              onClick={() => onUpdateAction(a.id, { done: !a.done })}
              className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border ${a.done ? 'border-accent bg-accent text-on-accent' : 'border-border'}`}
            >
              {a.done && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7" /></svg>}
            </button>
            <span className={`min-w-0 flex-1 truncate text-[13px] ${a.done ? 'text-muted line-through' : 'text-text'}`}>{a.text}</span>
            {a.routed ? (
              <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-[10.5px] font-semibold text-accent">Sent to Approvals</span>
            ) : (
              <>
                <select
                  value={a.dest}
                  onChange={(e) => onUpdateAction(a.id, { dest: e.target.value as ActionDest })}
                  className="shrink-0 rounded-[8px] border border-border bg-bg px-2 py-1 text-[11.5px] text-text-2 outline-none"
                >
                  {(['none', 'trello', 'calendar'] as ActionDest[]).map((d) => (
                    <option key={d} value={d}>{DEST_LABEL[d]}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={a.dest === 'none'}
                  onClick={() => onRoute(a)}
                  className="shrink-0 rounded-[8px] border border-accent px-2.5 py-1 text-[11.5px] font-semibold text-accent transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:border-border disabled:text-muted"
                >
                  Route
                </button>
              </>
            )}
          </div>
        ))}
        <div className="flex items-center gap-2">
          <input
            value={draftAction}
            onChange={(e) => setDraftAction(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAddAction()}
            placeholder="Add an action item…"
            className="flex-1 rounded-[10px] border border-border bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-accent"
          />
          <button type="button" onClick={onAddAction} disabled={draftAction.trim().length === 0} className="rounded-[10px] border border-border bg-bg px-3.5 py-2 text-[12.5px] font-semibold text-text-2 hover:bg-hover disabled:opacity-40">
            Add
          </button>
        </div>
      </div>

      <div className="mt-7 text-right">
        <button type="button" onClick={onDelete} className="text-[11.5px] text-muted transition hover:text-accent">Delete session</button>
      </div>
    </div>
  );
}
