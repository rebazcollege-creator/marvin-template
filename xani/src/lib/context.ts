import { getSettings } from '@/lib/settings';
import { getMemories, type MemoryEntry } from '@/lib/memory';

/**
 * Assembles the effective system prompt MARVIN runs with at request time.
 *
 * This is the bridge that makes memory matter: the base prompt (user-editable
 * in Settings) is concatenated with the durable things MARVIN has learned, so
 * learnings actually shape behaviour instead of just sitting in a list.
 *
 * Pinned memories are always included. Remaining memories are included up to a
 * budget, highest-confidence first, to keep the context lean and on-target.
 */

const MEMORY_BUDGET = 40;

function renderMemory(m: MemoryEntry): string {
  return `- (${m.category}) ${m.content}`;
}

export function selectMemoriesForContext(): MemoryEntry[] {
  const all = getMemories();
  const pinned = all.filter((m) => m.pinned);
  const rest = all
    .filter((m) => !m.pinned)
    .sort((a, b) => b.confidence - a.confidence);
  return [...pinned, ...rest].slice(0, MEMORY_BUDGET);
}

export function composeMarvinSystemPrompt(): string {
  const settings = getSettings();
  const memories = selectMemoriesForContext();

  if (memories.length === 0) return settings.prompts.marvin;

  const learned = memories.map(renderMemory).join('\n');
  return `${settings.prompts.marvin}

## What you've learned about ${settings.profile.name} (durable memory)
Treat these as established context. If something here is now wrong, say so and
propose an updated memory rather than silently ignoring it.

${learned}`;
}

/** Studio prompts also pick up relevant learned preferences. */
export function composeStudioSystemPrompt(
  studio: 'amargi' | 'leadstories' | 'moonshot',
): string {
  const settings = getSettings();
  const base = settings.prompts[studio];
  const prefs = selectMemoriesForContext().filter(
    (m) => m.category === 'preference' || m.category === 'correction',
  );
  if (prefs.length === 0) return base;
  return `${base}

## Learned preferences and corrections to honour
${prefs.map(renderMemory).join('\n')}`;
}
