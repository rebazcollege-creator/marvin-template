'use client';

/**
 * Notetaker — agenda → live transcript → structured summary with action items.
 * On-device transcription isn't wired yet, so "Start recording" is shown but
 * disabled, the meeting list is empty, and the stages are described honestly. No
 * meeting joins your calls; nothing is fabricated.
 */

const STAGES = [
  { n: 1, title: 'Agenda', body: 'Jot what the meeting is for. MARVIN keeps it beside the transcript so nothing gets missed.' },
  { n: 2, title: 'Live transcript', body: 'Audio is transcribed on your device while you talk — speaker-labelled, never uploaded.' },
  { n: 3, title: 'Summary & actions', body: 'Afterwards you get a tidy summary and checkable action items you can route to Trello or Calendar.' },
];

export default function NotetakerPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-none items-end gap-4 border-b border-border px-8 pb-4 pt-6">
        <div className="flex-1">
          <h1 className="font-display text-2xl font-semibold text-text">Notetaker</h1>
          <p className="mt-1 text-[13px] text-muted">
            On-device meeting notes — MARVIN turns conversations into notes and actions. Nothing joins your calls.
          </p>
        </div>
        <button
          type="button"
          disabled
          title="On-device transcription coming soon"
          className="flex cursor-not-allowed items-center gap-2 rounded-[11px] bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-on-accent opacity-50"
        >
          <span className="h-2 w-2 rounded-full bg-on-accent" />
          Start recording
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* meeting list */}
        <div className="w-[300px] flex-none overflow-y-auto border-r border-border p-3.5">
          <div className="mb-2 px-2 text-[11px] font-bold tracking-[0.08em] text-muted">MEETINGS</div>
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <p className="text-[12.5px] font-medium text-text">No meetings yet</p>
            <p className="mt-1 text-[11.5px] text-muted">Recorded sessions will list here.</p>
          </div>
        </div>

        {/* detail / how it works */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="max-w-[620px]">
            <div className="rounded-[16px] border border-dashed border-border bg-surface px-6 py-8 text-center">
              <p className="text-sm font-semibold text-text">Your notes will appear here</p>
              <p className="mx-auto mt-1.5 max-w-md text-[13px] text-text-2">
                Once on-device transcription is switched on, start a recording and MARVIN will build the
                summary, action items and full transcript on this page.
              </p>
            </div>

            <div className="mt-7 text-[11px] font-bold tracking-[0.08em] text-muted">HOW IT WORKS</div>
            <div className="mt-3 space-y-3">
              {STAGES.map((s) => (
                <div key={s.n} className="flex items-start gap-3 rounded-[14px] border border-border bg-surface p-4">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-bold text-accent">
                    {s.n}
                  </span>
                  <div>
                    <div className="text-[13.5px] font-semibold text-text">{s.title}</div>
                    <div className="mt-0.5 text-[12.5px] leading-relaxed text-text-2">{s.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
