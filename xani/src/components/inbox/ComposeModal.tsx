'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { enqueueApproval } from '@/lib/approvals';

/**
 * Email composer — new message or reply. "Send" never sends directly: it routes
 * the draft into Approvals (the trust gate), honest about the fact nothing leaves
 * until you approve it there. Reused by Inbox compose and per-message reply.
 */
export function ComposeModal({
  open,
  mode,
  initialTo = '',
  initialSubject = '',
  initialBody = '',
  account,
  onClose,
  onQueued,
}: {
  open: boolean;
  mode: 'new' | 'reply';
  initialTo?: string;
  initialSubject?: string;
  initialBody?: string;
  account?: string;
  onClose: () => void;
  onQueued: () => void;
}) {
  const [to, setTo] = useState(initialTo);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);

  const send = () => {
    if (to.trim().length === 0 || body.trim().length === 0) return;
    enqueueApproval({
      kind: 'email',
      title: subject.trim() || '(no subject)',
      source: `Gmail${account ? ` · ${account}` : ''} · to ${to.trim()}`,
      preview: `To: ${to.trim()}\nSubject: ${subject.trim() || '(no subject)'}\n\n${body.trim()}`,
      actionLabel: 'Send email',
      payload: { kind: 'email', to: to.trim(), subject: subject.trim() || '(no subject)', body: body.trim(), account },
    });
    onQueued();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={mode === 'reply' ? 'Reply' : 'New email'} subtitle="Held in Approvals before it sends" width="max-w-xl">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-muted">To</span>
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" className="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-text outline-none focus:border-accent" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-muted">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-text outline-none focus:border-accent" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-muted">Message</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" className="min-h-40 w-full resize-y rounded-[10px] border border-border bg-bg px-3 py-3 text-[13.5px] leading-relaxed text-text outline-none focus:border-accent" />
        </label>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <p className="text-[11.5px] text-muted">MARVIN can draft this for you once the runtime is running.</p>
        <div className="flex gap-2.5">
          <button type="button" onClick={onClose} className="rounded-[10px] border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-text-2 hover:bg-hover">Cancel</button>
          <button type="button" onClick={send} disabled={to.trim().length === 0 || body.trim().length === 0} className="rounded-[10px] bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent-dim disabled:opacity-40">Send</button>
        </div>
      </div>
    </Modal>
  );
}
