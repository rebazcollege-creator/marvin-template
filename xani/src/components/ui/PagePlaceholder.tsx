/**
 * Empty-state page shell. Used while a view's connector is pending.
 * No mocked content — describes what will appear once wired.
 */
export function PagePlaceholder({
  title,
  subtitle,
  note,
}: {
  title: string;
  subtitle?: string;
  note: string;
}) {
  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-3xl text-ink">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-ink-soft">{subtitle}</p> : null}
      <div className="mt-8 rounded-2xl border border-dashed border-line bg-paper-card p-8">
        <p className="text-sm text-ink-soft">{note}</p>
      </div>
    </div>
  );
}
