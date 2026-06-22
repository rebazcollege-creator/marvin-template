'use client';

import { useState } from 'react';

/**
 * MARVIN chat input. The send handler is intentionally a no-op until the
 * Anthropic client + agent routing (src/lib/anthropic.ts, src/prompts/marvin.ts)
 * are wired to a backend route. No mocked responses — empty state only.
 */
export function MarvinInput() {
  const [value, setValue] = useState('');

  return (
    <form
      className="flex items-center gap-3 rounded-xl border border-line bg-paper-card p-3 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        // TODO(Phase 2): POST to /api/marvin once the route is implemented.
      }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ask MARVIN…"
        className="flex-1 bg-transparent px-2 text-sm text-ink outline-none placeholder:text-ink-soft"
      />
      <button
        type="submit"
        disabled={value.trim().length === 0}
        className="rounded-lg bg-terracotta px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-terracotta-dim disabled:cursor-not-allowed disabled:opacity-40"
      >
        Send
      </button>
    </form>
  );
}
