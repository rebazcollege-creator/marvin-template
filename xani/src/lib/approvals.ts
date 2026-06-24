import { readJson, writeJson, newId } from '@/lib/storage';
import { logActivity } from '@/lib/activity';
import type { ActPayload } from '@/lib/marvin-protocol';

function broadcast(): void {
  try {
    window.dispatchEvent(new CustomEvent('xani:approvals-changed'));
  } catch {
    /* SSR / no window */
  }
}

/**
 * The Approvals queue — the trust gate. Outbound actions MARVIN (or a surface like
 * Notetaker/Inbox/Buffer) prepares land here as pending items with a preview;
 * nothing "leaves" without the user's nod. Honest: approving marks intent — the
 * real send/create happens in the runtime when it's on. Persisted locally.
 */

export type ApprovalKind = 'email' | 'social' | 'calendar' | 'files' | 'slack' | 'task';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export type ApprovalItem = {
  id: string;
  kind: ApprovalKind;
  title: string;
  source: string;
  preview: string;
  actionLabel: string;
  createdAt: string;
  status: ApprovalStatus;
  decidedAt?: string;
  /** Structured data so /act can perform the real action on approve. */
  payload?: ActPayload;
};

const KEY = 'xani.approvals.v1';

export function listApprovals(): ApprovalItem[] {
  return readJson<ApprovalItem[]>(KEY, []);
}
export function saveApprovals(list: ApprovalItem[]): void {
  writeJson(KEY, list);
}

export function enqueueApproval(input: {
  kind: ApprovalKind;
  title: string;
  source: string;
  preview: string;
  actionLabel?: string;
  payload?: ActPayload;
}): ApprovalItem {
  const item: ApprovalItem = {
    id: newId(),
    kind: input.kind,
    title: input.title,
    source: input.source,
    preview: input.preview,
    actionLabel: input.actionLabel ?? 'Approve',
    createdAt: new Date().toISOString(),
    status: 'pending',
    payload: input.payload,
  };
  saveApprovals([item, ...listApprovals()]);
  logActivity({ kind: 'approval', title: `Prepared: ${item.title}`, detail: item.source, tag: 'Needs you' });
  broadcast();
  return item;
}

export function decideApproval(id: string, status: 'approved' | 'rejected'): void {
  const all = listApprovals();
  const item = all.find((a) => a.id === id);
  saveApprovals(all.map((a) => (a.id === id ? { ...a, status, decidedAt: new Date().toISOString() } : a)));
  if (item) {
    logActivity({
      kind: status === 'approved' ? 'approved' : 'rejected',
      title: `${status === 'approved' ? 'Approved' : 'Rejected'}: ${item.title}`,
      detail: item.source,
    });
  }
  broadcast();
}

export function pendingCount(): number {
  return listApprovals().filter((a) => a.status === 'pending').length;
}
