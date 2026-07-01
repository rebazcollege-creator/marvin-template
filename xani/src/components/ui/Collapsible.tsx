'use client';

import { useState } from 'react';

/**
 * Collapsible settings/detail card — progressive disclosure, the core design rule.
 * Header shows a title + one-line summary; body reveals on click with a rotating
 * caret. Calm and on-brand.
 */
export function Collapsible({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-4 rounded-2xl border border-border bg-surface px-[22px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 py-[15px] text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold text-text">{title}</div>
          {summary && <div className="mt-0.5 truncate text-[12px] text-muted">{summary}</div>}
        </div>
        <span className="flex text-muted" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 8l5 5 5-5" />
          </svg>
        </span>
      </button>
      {open && <div className="xfade pb-[18px]">{children}</div>}
    </div>
  );
}
