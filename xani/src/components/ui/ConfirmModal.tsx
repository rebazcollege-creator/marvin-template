'use client';

import { Modal } from '@/components/ui/Modal';

/**
 * Shared confirmation for outbound/destructive actions — the design's `confirm`
 * dialog. Outward actions (send, post, create, route) raise this before anything
 * leaves. Calm and on-brand.
 */
export function ConfirmModal({
  open,
  title,
  body,
  detail,
  okLabel = 'Confirm',
  tone = 'accent',
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body?: React.ReactNode;
  detail?: React.ReactNode;
  okLabel?: string;
  tone?: 'accent' | 'danger';
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-md">
      {body && <p className="text-[13.5px] leading-relaxed text-text-2">{body}</p>}
      {detail && (
        <div className="mt-3 whitespace-pre-wrap rounded-[11px] border border-border bg-bg px-3.5 py-3 text-[12.5px] leading-relaxed text-text-2">
          {detail}
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-[10px] border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-text-2 transition hover:bg-hover"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className={`rounded-[10px] px-4 py-2 text-[13px] font-semibold text-on-accent transition ${
            tone === 'danger' ? 'bg-[#b4452a] hover:brightness-95' : 'bg-accent hover:bg-accent-dim'
          }`}
        >
          {okLabel}
        </button>
      </div>
    </Modal>
  );
}
