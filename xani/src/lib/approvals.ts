import { readJson, writeJson, newId } from '@/lib/storage';

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
  };
  saveApprovals([item, ...listApprovals()]);
  return item;
}

export function pendingCount(): number {
  return listApprovals().filter((a) => a.status === 'pending').length;
}
