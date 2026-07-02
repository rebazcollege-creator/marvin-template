'use client';

import { useState } from 'react';
import { fetchDrive, PATHS } from '@/lib/marvin-data';
import { useLiveData } from '@/lib/use-live-data';
import { RefreshButton } from '@/components/ui/RefreshButton';
import type { DriveData, DriveKind } from '@/lib/marvin-protocol';

/**
 * Drive — a Google-Drive-style browser bound to the sidecar (which owns the
 * OAuth tokens). Honest states: loading, sidecar offline, not connected, empty,
 * or the files. No mock files — when Drive isn't wired the list is genuinely empty.
 */

const KIND_TINT: Record<DriveKind, { tint: string; edge: string }> = {
  folder: { tint: 'var(--accent-soft)', edge: '#C0613A' },
  doc: { tint: '#E4ECF6', edge: '#4F76B8' },
  sheet: { tint: '#E8EEE5', edge: '#6E8B6A' },
  slide: { tint: '#F8EFDF', edge: '#D89A4E' },
  pdf: { tint: 'var(--accent-soft)', edge: '#C0613A' },
  image: { tint: '#ECE7F1', edge: '#7A6E9C' },
  file: { tint: 'var(--hover)', edge: 'var(--text-2)' },
};

function KindIcon({ kind }: { kind: DriveKind }) {
  const p = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (kind === 'folder') return (<svg {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>);
  if (kind === 'image') return (<svg {...p}><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="m5 17 4-4 3 3 3-3 4 4" /></svg>);
  if (kind === 'sheet') return (<svg {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16M4 15h16M10 4v16" /></svg>);
  if (kind === 'slide') return (<svg {...p}><rect x="4" y="5" width="16" height="11" rx="2" /><path d="M12 16v3M9 21h6" /></svg>);
  // doc / pdf / file
  return (<svg {...p}><path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v4h4M9 13h6M9 17h6" /></svg>);
}

const LABEL: Record<DriveKind, string> = {
  folder: 'Folder', doc: 'Document', sheet: 'Spreadsheet', slide: 'Presentation', pdf: 'PDF', image: 'Image', file: 'File',
};

function relTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '';
  const mins = Math.round((Date.now() - d) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Star({ on }: { on: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={on ? '#D89A4E' : 'none'} stroke={on ? '#D89A4E' : 'currentColor'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3 2.6 5.6 6 .8-4.4 4.1 1.1 6L12 16.8 6.7 19.5l1.1-6L3.4 9.4l6-.8z" />
    </svg>
  );
}

export default function DrivePage() {
  const { data, state, refresh, refreshing } = useLiveData<DriveData>(PATHS.drive, fetchDrive);
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const badge =
    state === 'loading' ? 'Loading…' : state === 'offline' ? 'Sidecar offline' : data?.connected ? 'Connected' : 'Not connected';
  const files = data?.files ?? [];

  return (
    <div className="mx-auto max-w-[920px] px-8 pb-16 pt-7">
      <header className="mb-2 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text">Drive</h1>
          <p className="mt-1 text-[13px] text-muted">Files · Google Drive</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11.5px] text-muted">{badge}</span>
          <RefreshButton onClick={refresh} refreshing={refreshing} />
          <div className="flex rounded-[10px] border border-border bg-surface p-0.5">
            {(['grid', 'list'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                aria-label={`${v} view`}
                onClick={() => setView(v)}
                className={`grid h-7 w-8 place-items-center rounded-lg transition ${
                  view === v ? 'bg-accent-soft text-accent' : 'text-text-2 hover:text-text'
                }`}
              >
                {v === 'grid' ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mb-5 text-[12.5px] font-medium text-text-2">My Drive</div>

      {state === 'loading' && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="xsk h-[92px] rounded-[14px]" />
          ))}
        </div>
      )}

      {state === 'offline' && (
        <Note>
          MARVIN’s runtime isn’t reachable. Start it with <code className="rounded bg-bg px-1">npm run sidecar</code>.
        </Note>
      )}

      {state === 'loaded' && data && !data.connected && (
        <Note>
          Google Drive isn’t connected. Add <code className="rounded bg-bg px-1">GOOGLE_DRIVE_*</code> credentials
          (or connect it on the Connections page) to browse your files here.
        </Note>
      )}

      {state === 'loaded' && data?.connected && data.error && (
        <Note>Couldn’t read your Drive just now ({data.error}). This isn’t an empty Drive — try Refresh in a moment.</Note>
      )}
      {state === 'loaded' && data?.connected && !data.error && files.length === 0 && (
        <Note>No files found in your Drive.</Note>
      )}

      {state === 'loaded' && data?.connected && files.length > 0 && (
        view === 'grid' ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
            {files.map((f) => {
              const t = KIND_TINT[f.kind];
              return (
                <div key={f.id} className="group relative rounded-[14px] border border-border bg-surface p-4 transition hover:bg-hover">
                  {f.starred && <span className="absolute right-3 top-3"><Star on /></span>}
                  <span className="grid h-10 w-10 place-items-center rounded-[11px]" style={{ background: t.tint, color: t.edge }}>
                    <KindIcon kind={f.kind} />
                  </span>
                  <div className="mt-3 truncate text-[13px] font-medium text-text" title={f.name}>{f.name}</div>
                  <div className="mt-0.5 text-[11px] text-muted">{relTime(f.modified)}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
            {files.map((f, i) => {
              const t = KIND_TINT[f.kind];
              return (
                <div key={f.id} className={`flex items-center gap-3 px-4 py-2.5 transition hover:bg-hover ${i > 0 ? 'border-t border-border' : ''}`}>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px]" style={{ background: t.tint, color: t.edge }}>
                    <KindIcon kind={f.kind} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text" title={f.name}>{f.name}</span>
                  <span className="hidden w-24 text-[11.5px] text-muted sm:block">{LABEL[f.kind]}</span>
                  <span className="w-20 text-right text-[11.5px] text-muted">{relTime(f.modified)}</span>
                  <span className="w-5 text-right">{f.starred && <Star on />}</span>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-sm text-text-2">{children}</div>
  );
}
