'use client';

import { useState } from 'react';

/**
 * MARVIN chat input. The agent runtime (Node sidecar → Claude Messages API with
 * the manual tool loop + confirmation gate) is not wired yet, so rather than a
 * silent no-op this shows an honest "not connected" state.
 */
export function MarvinInput() {
  const [value, setValue] = useState('');
  const [notice, setNotice] = useState(false);

  return (
    <div>
      <form
        className="flex items-center gap-3 rounded-xl border border-line bg-paper-card p-3 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) setNotice(true);
        }}
      >
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Ask MARVIN"
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
      {notice && (
        <p role="status" className="mt-2 px-1 text-xs text-ink-soft">
          MARVIN&apos;s runtime isn&apos;t connected yet — the chat goes live once
          the Node sidecar + Claude loop ship. Your message wasn&apos;t lost.
        </p>
      )}
    </div>
  );
}
