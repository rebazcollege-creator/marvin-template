/**
 * MARVIN's memory.
 *
 * Xanî is built for one user, so MARVIN is meant to *learn* from your
 * conversations and carry that knowledge forward across sessions. This module
 * is the "memory place": a durable, fully-editable store of what MARVIN has
 * learned about you and your work.
 *
 * Two kinds of memory live here:
 *  1. MemoryEntry   — distilled, durable knowledge ("Rebaz prefers X",
 *                     "Amargi captions never use the word Y"). MARVIN extracts
 *                     these from conversation; you can also add/edit/delete them.
 *  2. SelfAdjustment — MARVIN reasoning about its *own* behaviour and proposing
 *                     a change to how it functions (e.g. tweak a Studio prompt).
 *                     Because changing its own functioning is consequential, a
 *                     proposal is never auto-applied: you approve or reject it.
 *                     This is how MARVIN "updates itself" while still obeying you.
 *
 * Persistence today: localStorage (works in `next dev` and the Tauri webview).
 * Swap the load/save bodies to a Tauri fs config/SQLite store later — callers
 * only use the exported functions.
 */

export type MemoryCategory =
  | 'preference' // how Rebaz likes things done
  | 'fact' // stable facts about Rebaz / his roles / contacts
  | 'workflow' // recurring processes and routines
  | 'correction' // something MARVIN got wrong and was told to change
  | 'other';

export interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  content: string;
  /** Where this came from. */
  source: 'conversation' | 'manual' | 'inferred';
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  /** Pinned memories are always injected into MARVIN's context. */
  pinned: boolean;
  /** 0..1 — how sure MARVIN is. Low-confidence inferences can be reviewed. */
  confidence: number;
}

/** What part of MARVIN a self-adjustment targets. */
export type AdjustmentTarget =
  | 'prompt.marvin'
  | 'prompt.amargi'
  | 'prompt.leadstories'
  | 'prompt.moonshot'
  | 'settings.daysOff'
  | 'behaviour'; // a general behavioural note, not a specific field

export interface SelfAdjustment {
  id: string;
  target: AdjustmentTarget;
  /** Why MARVIN wants to change — its reasoning, in plain language. */
  rationale: string;
  /** The proposed new value or a human-readable description of the change. */
  proposed: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

const MEM_KEY = 'xani.memory.v1';
const ADJ_KEY = 'xani.adjustments.v1';

function read<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, value: T[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Memory entries ────────────────────────────────────────────────

export function getMemories(): MemoryEntry[] {
  return read<MemoryEntry>(MEM_KEY).sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function addMemory(
  entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>,
): MemoryEntry {
  const now = new Date().toISOString();
  const created: MemoryEntry = { ...entry, id: uid(), createdAt: now, updatedAt: now };
  write(MEM_KEY, [created, ...read<MemoryEntry>(MEM_KEY)]);
  return created;
}

export function updateMemory(id: string, patch: Partial<MemoryEntry>): void {
  const next = read<MemoryEntry>(MEM_KEY).map((m) =>
    m.id === id ? { ...m, ...patch, updatedAt: new Date().toISOString() } : m,
  );
  write(MEM_KEY, next);
}

export function removeMemory(id: string): void {
  write(
    MEM_KEY,
    read<MemoryEntry>(MEM_KEY).filter((m) => m.id !== id),
  );
}

// ── Self-adjustment proposals ─────────────────────────────────────

export function getAdjustments(): SelfAdjustment[] {
  return read<SelfAdjustment>(ADJ_KEY).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export function proposeAdjustment(
  proposal: Omit<SelfAdjustment, 'id' | 'createdAt' | 'status'>,
): SelfAdjustment {
  const created: SelfAdjustment = {
    ...proposal,
    id: uid(),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  write(ADJ_KEY, [created, ...read<SelfAdjustment>(ADJ_KEY)]);
  return created;
}

export function setAdjustmentStatus(
  id: string,
  status: 'approved' | 'rejected',
): void {
  const next = read<SelfAdjustment>(ADJ_KEY).map((a) =>
    a.id === id ? { ...a, status } : a,
  );
  write(ADJ_KEY, next);
}
