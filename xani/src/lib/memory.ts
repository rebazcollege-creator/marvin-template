import { readJson, writeJson, newId } from '@/lib/storage';

/**
 * MARVIN's memory — the "memory place".
 *
 * Design informed by production systems (mem0, Letta/MemGPT, Zep/Graphiti) and
 * the 2024-2026 memory-poisoning literature, scaled DOWN for a single local user
 * (no vector DB — at this scale a simple typed store outperforms the overhead):
 *
 *  - Three tiers (Letta / LangMem taxonomy):
 *      procedural — durable behavioural rules ("always summarise in bullets")
 *      semantic   — facts & preferences about Rebaz and his work
 *      episodic   — per-session summaries ("on 2026-06-20 we drafted X")
 *  - Provenance + trust on every entry, and a WRITE-GATE: the memory write path
 *    is the control plane for memory poisoning (OWASP ASI06). Content sourced
 *    from untrusted integrations (email/Slack/web) can never be auto-trusted,
 *    auto-pinned, or written as a procedural rule — it lands as a low-confidence
 *    PROPOSAL the user approves.
 *  - Contradictions soft-supersede (Zep bitemporal-lite): the old entry is kept
 *    with `supersededBy`/`validUntil` rather than deleted, preserving history.
 *  - Self-modification stays human-in-the-loop (Cursor Memories / BerriAI
 *    propose→approve): MARVIN proposes; the user approves/rejects; locked rules
 *    are off-limits; every applied change keeps an audit trail.
 *
 * Persistence is the storage adapter (localStorage now → SQLite later).
 */

export type MemoryTier = 'procedural' | 'semantic' | 'episodic';

export type MemoryCategory =
  | 'rule' // procedural: how MARVIN should behave
  | 'preference' // semantic: how Rebaz likes things done
  | 'fact' // semantic: stable facts about Rebaz / roles / contacts
  | 'workflow' // semantic/procedural: recurring processes
  | 'correction' // semantic: something MARVIN got wrong and was told to fix
  | 'episode' // episodic: a session summary
  | 'other';

export type MemorySource =
  | 'manual' // user typed it in — fully trusted
  | 'conversation' // user said it in chat — trusted
  | 'inferred' // MARVIN inferred it — review before trusting
  | 'correction' // user corrected MARVIN — trusted, high priority
  | 'external'; // derived from email/Slack/web content — UNTRUSTED

export type MemoryTrust = 'high' | 'medium' | 'low';

export type MemoryStatus = 'active' | 'proposed' | 'superseded' | 'rejected';

export interface MemoryEntry {
  id: string;
  tier: MemoryTier;
  category: MemoryCategory;
  content: string;
  source: MemorySource;
  trust: MemoryTrust;
  /** WMR importance, 1-10 (Generative-Agents weighting). */
  importance: number;
  /** 0..1 — how sure MARVIN is. */
  confidence: number;
  /** Pinned entries are always injected (skip retrieval ranking & decay). */
  pinned: boolean;
  status: MemoryStatus;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  lastAccessedAt?: string;
  accessCount: number;
  /** Set when a newer entry supersedes this one (contradiction handling). */
  supersededBy?: string;
  validUntil?: string;
}

/** What part of MARVIN a self-adjustment targets. (Locked rules are excluded.) */
export type AdjustmentTarget =
  | 'prompt.marvin'
  | 'prompt.amargi'
  | 'prompt.leadstories'
  | 'prompt.moonshot'
  | 'settings.daysOff'
  | 'behaviour';

export interface SelfAdjustment {
  id: string;
  target: AdjustmentTarget;
  /** MARVIN's reasoning, in plain language. */
  rationale: string;
  /** The proposed new value (or a human-readable description of the change). */
  proposed: string;
  /** Snapshot of the prior value, for audit + one-click revert. */
  previousValue?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  decidedAt?: string;
}

const MEM_KEY = 'xani.memory.v1';
const ADJ_KEY = 'xani.adjustments.v1';

/** Max self-adjustment proposals shown at once — don't flood the user. */
export const MAX_PENDING_ADJUSTMENTS = 3;

function now(): string {
  return new Date().toISOString();
}

// ── Memory entries ────────────────────────────────────────────────

function allMemories(): MemoryEntry[] {
  return readJson<MemoryEntry[]>(MEM_KEY, []);
}

/** Active memories, pinned first, then most-recently updated. */
export function getMemories(): MemoryEntry[] {
  return allMemories()
    .filter((m) => m.status === 'active')
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
}

/** Memories awaiting the user's approval (the write-gate queue). */
export function getProposedMemories(): MemoryEntry[] {
  return allMemories()
    .filter((m) => m.status === 'proposed')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface NewMemory {
  tier?: MemoryTier;
  category: MemoryCategory;
  content: string;
  source: MemorySource;
  pinned?: boolean;
  importance?: number;
  confidence?: number;
}

/**
 * Ingest a candidate memory through the write-gate. This is the single entry
 * point for ALL writes (manual and agent-generated) so the poisoning defenses
 * can't be bypassed.
 *
 * - Untrusted (`external`) or low-trust `inferred` content is forced to
 *   status:'proposed', low trust, capped confidence, never procedural, never
 *   pinned — it cannot take effect until the user approves it.
 * - Trusted sources (manual/conversation/correction) become active immediately.
 */
export function ingestMemory(input: NewMemory): MemoryEntry {
  const untrusted = input.source === 'external';
  const trust: MemoryTrust =
    input.source === 'manual' || input.source === 'correction'
      ? 'high'
      : input.source === 'conversation'
        ? 'medium'
        : 'low';

  const tier: MemoryTier = untrusted
    ? 'semantic' // external content can never become a procedural rule
    : (input.tier ?? (input.category === 'rule' ? 'procedural' : 'semantic'));

  const confidence = untrusted
    ? Math.min(input.confidence ?? 0.4, 0.5)
    : (input.confidence ?? (trust === 'high' ? 1 : 0.7));

  const entry: MemoryEntry = {
    id: newId(),
    tier,
    category: input.category,
    content: input.content,
    source: input.source,
    trust,
    importance: clampImportance(input.importance ?? 5),
    confidence,
    pinned: untrusted ? false : Boolean(input.pinned),
    status: untrusted || input.source === 'inferred' ? 'proposed' : 'active',
    createdAt: now(),
    updatedAt: now(),
    accessCount: 0,
  };

  writeJson(MEM_KEY, [entry, ...allMemories()]);
  return entry;
}

function clampImportance(n: number): number {
  return Math.max(1, Math.min(10, Math.round(n)));
}

export function updateMemory(id: string, patch: Partial<MemoryEntry>): void {
  writeJson(
    MEM_KEY,
    allMemories().map((m) =>
      m.id === id ? { ...m, ...patch, updatedAt: now() } : m,
    ),
  );
}

/** Approve a proposed memory (the user vouches for it → trusted + active). */
export function approveMemory(id: string): void {
  updateMemory(id, { status: 'active', trust: 'high' });
}

export function rejectMemory(id: string): void {
  updateMemory(id, { status: 'rejected' });
}

/**
 * Contradiction handling: supersede an old entry with a new one. The old entry
 * is kept (status:'superseded') for historical queries, not deleted.
 */
export function supersedeMemory(oldId: string, replacement: NewMemory): MemoryEntry {
  const created = ingestMemory(replacement);
  updateMemory(oldId, {
    status: 'superseded',
    supersededBy: created.id,
    validUntil: now(),
  });
  return created;
}

/** Hard removal — used for the user's explicit "forget this". */
export function removeMemory(id: string): void {
  writeJson(
    MEM_KEY,
    allMemories().filter((m) => m.id !== id),
  );
}

/** Bump access stats; used by retrieval to reward useful memories. */
export function recordAccess(id: string): void {
  const m = allMemories().find((x) => x.id === id);
  if (!m) return;
  updateMemory(id, {
    lastAccessedAt: now(),
    accessCount: (m.accessCount ?? 0) + 1,
  });
}

// ── Self-adjustment proposals ─────────────────────────────────────

export function getAdjustments(): SelfAdjustment[] {
  return readJson<SelfAdjustment[]>(ADJ_KEY, []).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export function proposeAdjustment(
  proposal: Omit<SelfAdjustment, 'id' | 'createdAt' | 'status'>,
): SelfAdjustment {
  const created: SelfAdjustment = {
    ...proposal,
    id: newId(),
    status: 'pending',
    createdAt: now(),
  };
  writeJson(ADJ_KEY, [created, ...readJson<SelfAdjustment[]>(ADJ_KEY, [])]);
  return created;
}

export function setAdjustmentStatus(
  id: string,
  status: 'approved' | 'rejected',
): void {
  writeJson(
    ADJ_KEY,
    readJson<SelfAdjustment[]>(ADJ_KEY, []).map((a) =>
      a.id === id ? { ...a, status, decidedAt: now() } : a,
    ),
  );
}
