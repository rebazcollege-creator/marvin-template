'use client';

import { useEffect } from 'react';

/**
 * Calm modal primitive — soft backdrop, centered card, xpop entry. Closes on Esc
 * and backdrop click. Used for connection flows, confirmations, detail panels.
 * Stays on-brand: warm surface, generous padding, no heavy shadow.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="xfade fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 px-4 py-[8vh] backdrop-blur-sm"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        className={`xpop w-full ${width} overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_24px_64px_-24px_rgba(0,0,0,.4)]`}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
            <div className="min-w-0">
              {title && <h2 className="font-display text-lg font-semibold text-text">{title}</h2>}
              {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-2 transition hover:bg-hover hover:text-text"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        )}
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
