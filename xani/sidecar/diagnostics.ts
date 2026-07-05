/**
 * Self-diagnostic — turns each connector's raw (connected / error) into a plain-language
 * verdict Rebaz can act on without a developer. The whole point: when the brief is empty
 * or the inbox won't load, he should see "LeadStories Gmail: sign-in expired, reconnect it"
 * instead of a silent blank. Non-developer first.
 *
 * Pure and side-effect free (same discipline as the other sidecar cores): the endpoint runs
 * the live probes, this classifies them, and it unit-tests without any network.
 */

export interface ProbeResult {
  id: string;
  name: string;
  /** Whether the credentials for this integration are present in the runtime. */
  credPresent: boolean;
  /** Whether a live call actually succeeded. */
  connected: boolean;
  /** The connector's raw error string, if any. */
  error?: string;
}

export type HealthStatus = 'live' | 'needs_setup' | 'error';
export interface HealthRow {
  id: string;
  name: string;
  status: HealthStatus;
  /** One plain sentence on the state. */
  detail: string;
  /** What to do about it (only for needs_setup / error). */
  hint?: string;
}

/** Classify a connector's error into a plain-language cause + fix. */
function classifyError(raw: string): { detail: string; hint: string } {
  const e = (raw || '').toLowerCase();
  if (/invalid_grant|unauthorized|401|403|token has been expired|revoked|invalid credentials|auth /.test(e)) {
    return { detail: 'Sign-in has expired or was revoked.', hint: 'Reconnect this account (its saved sign-in is no longer valid).' };
  }
  if (/no_key|missing|not set|no api key|no access_token/.test(e)) {
    return { detail: 'A required key is missing.', hint: 'Add the key on the Connections page, then retry.' };
  }
  if (/timeout|timed out|abort|network|fetch failed|enotfound|econn/.test(e)) {
    return { detail: 'Could not reach the service (network or timeout).', hint: 'Check your connection and retry; if it persists the service may be down.' };
  }
  if (/rate|429|quota/.test(e)) {
    return { detail: 'The service is rate-limiting requests right now.', hint: 'Wait a few minutes and retry — nothing is broken.' };
  }
  return { detail: raw.slice(0, 140), hint: 'Reconnect this integration; if it keeps failing, check its credentials.' };
}

/**
 * Build the health report, worst-first (errors, then not-set-up, then live) so the thing
 * that needs Rebaz sits at the top.
 */
export function summarizeHealth(probes: ProbeResult[]): HealthRow[] {
  const rows = probes.map((p): HealthRow => {
    if (p.connected) return { id: p.id, name: p.name, status: 'live', detail: 'Working.' };
    if (!p.credPresent) {
      return { id: p.id, name: p.name, status: 'needs_setup', detail: 'Not connected yet.', hint: 'Add its credentials on the Connections page.' };
    }
    const { detail, hint } = classifyError(p.error ?? '');
    return { id: p.id, name: p.name, status: 'error', detail, hint };
  });
  const rank: Record<HealthStatus, number> = { error: 0, needs_setup: 1, live: 2 };
  return rows.sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name));
}

/** A one-line roll-up for the top of the page ("4 live · 1 needs you · 1 not set up"). */
export function healthHeadline(rows: HealthRow[]): string {
  const live = rows.filter((r) => r.status === 'live').length;
  const err = rows.filter((r) => r.status === 'error').length;
  const setup = rows.filter((r) => r.status === 'needs_setup').length;
  const parts: string[] = [];
  if (live) parts.push(`${live} live`);
  if (err) parts.push(`${err} needs you`);
  if (setup) parts.push(`${setup} not set up`);
  return parts.join(' · ') || 'Nothing connected yet';
}
