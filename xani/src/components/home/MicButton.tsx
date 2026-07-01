'use client';

import { useRef, useState } from 'react';
import { transcribeAudio } from '@/lib/marvin-client';

/**
 * Voice brain-dump (P2) — the lowest-friction capture there is: speak the thought, and it
 * lands as text. For an ADHD brain, talking beats typing when the idea is fleeting. Uses
 * the sidecar's transcription; degrades silently if the mic or runtime isn't available.
 */
export function MicButton({ onText }: { onText: (t: string) => void }) {
  const [state, setState] = useState<'idle' | 'recording' | 'working'>('idle');
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setState('working');
        const blob = new Blob(chunks.current, { type: mr.mimeType || 'audio/webm' });
        const r = await transcribeAudio(blob);
        setState('idle');
        if (r.ok && r.text) onText(r.text.trim());
      };
      rec.current = mr;
      mr.start();
      setState('recording');
    } catch {
      setState('idle'); // no mic / denied — button just does nothing
    }
  };
  const stop = () => rec.current?.stop();

  const label = state === 'recording' ? 'Stop & save' : state === 'working' ? 'Transcribing…' : 'Speak it';
  return (
    <button
      type="button"
      onClick={state === 'recording' ? stop : state === 'idle' ? () => void start() : undefined}
      title={label}
      aria-label={label}
      className={`grid h-10 w-10 flex-none place-items-center rounded-xl border text-[17px] transition ${
        state === 'recording'
          ? 'border-transparent bg-lead text-white animate-pulse'
          : 'border-border-2 bg-surface-2 text-text-2 hover:bg-hover'
      }`}
    >
      {state === 'working' ? '…' : '🎙️'}
    </button>
  );
}
