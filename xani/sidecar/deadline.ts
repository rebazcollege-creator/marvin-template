/**
 * Deadline extraction helpers — pure, so they unit-test without booting the server.
 *
 * Triage already reads every act-item once on the model; asking it for a "deadline"
 * field in the same call costs nothing extra and makes the morning brief and Home
 * order by real due dates instead of guessing. The model is generous and sometimes
 * hallucinates, so every value it returns is validated here before it reaches the UI.
 */

/**
 * The instruction appended to a triage prompt so the model can resolve relative
 * deadlines ("by Friday", "tomorrow", "end of week") against a concrete date.
 * `today` is YYYY-MM-DD in Rebaz's timezone (the sidecar's local day).
 */
export function deadlineRule(today: string): string {
  return (
    `\n\nToday is ${today}. If — and only if — a message states a concrete due date/time for ` +
    `Rebaz's OWN action (an explicit date, or a clear relative one like "by Friday", "tomorrow", ` +
    `"end of week", "COB Thursday"), resolve it to an ISO calendar date and return it as ` +
    `"deadline":"YYYY-MM-DD". A date that has already passed, a date for someone else's action, ` +
    `or a vague "soon/whenever" is NOT a deadline — omit the field. Never invent a date the text ` +
    `does not support.`
  );
}

/**
 * Validate a model-returned deadline. Accepts only a real-looking ISO date whose year
 * is sane (2020–2100) and whose month/day are in range; anything else (prose, null,
 * "ASAP", a hallucinated year) becomes undefined so the UI never shows a bogus due date.
 * Returns the normalised `YYYY-MM-DD` (time and timezone suffixes are dropped).
 */
export function normalizeDeadline(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return undefined;
  const [, y, mo, d] = m;
  const yr = Number(y);
  const mon = Number(mo);
  const day = Number(d);
  if (yr < 2020 || yr > 2100) return undefined;
  if (mon < 1 || mon > 12) return undefined;
  if (day < 1 || day > 31) return undefined;
  // Reject impossible calendar days (e.g. 2026-02-31) by round-tripping through Date.
  const dt = new Date(Date.UTC(yr, mon - 1, day));
  if (dt.getUTCFullYear() !== yr || dt.getUTCMonth() !== mon - 1 || dt.getUTCDate() !== day) return undefined;
  return `${y}-${mo}-${d}`;
}
