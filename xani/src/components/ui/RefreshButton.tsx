'use client';

/** Small, consistent refresh control for the data screens. Spins while refreshing. */
export function RefreshButton({ onClick, refreshing }: { onClick: () => void; refreshing?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={refreshing}
      title="Refresh"
      aria-label="Refresh"
      className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-border bg-surface text-[15px] text-text-2 transition hover:bg-hover disabled:opacity-50"
    >
      <span className={refreshing ? 'animate-spin' : ''}>⟳</span>
    </button>
  );
}
