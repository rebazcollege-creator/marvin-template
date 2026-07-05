# Xanî — Comprehensive Audit (Fable 5, multi-agent) — 2026-07-05

## Status: PARTIAL (salvaged)

A 16-reviewer Fable 5 audit with adversarial verification was launched. It hit the
session usage limit (resets 20:50 UTC) after **6 of 16 reviewers** completed and
**before any verification, the completeness critic, or the auto-writer ran**. This
report is salvaged from the 6 completed reviewers (40 raw findings) plus **manual
verification** of the highest-impact items by re-reading the code.

- **Completed reviewers:** server, connectors, pure-modules (this session's new code),
  security, model-layer, home-page.
- **Did NOT run:** client-contract, memory/learning, lib-infra, other-pages, and the 6
  cross-cutting sweeps (prompt-injection, concurrency, secrets, honesty-UX,
  error-handling, architecture). **Re-run to cover these** — see "Completing the audit".
- **Verification:** the workflow's 3-lens adversarial pass never executed, so findings
  below are the reviewers' claims. Items marked ✅ **VERIFIED** were confirmed by me
  reading the code; the rest are **unverified** and need a second look before acting.

Counts: 40 findings — 7 High, ~20 Medium, ~13 Low.

---

## Critical & High

### 1. ✅ VERIFIED — The morning brief can freeze all day on a false "you're clear"
`sidecar/server.ts` (refreshMorningBrief ~L493; getMorningBrief ~L500; scheduledTriageRefresh ~L441)
**High · correctness · this session's code.** `refreshMorningBrief()` caches its result
*unconditionally* (`triageState.brief = snap`), even when: the model call threw, the
provider is absent, or triage hadn't finished at boot so `inboxActs/slackActs` were still
empty. Once an empty snapshot is stamped with today's `forDate`, `getMorningBrief()`
returns it without kicking a refresh and `scheduledTriageRefresh()` skips regeneration —
no retry until midnight. On a cold start (Tauri spawns the sidecar and loads Home while
triage is still running) the brief is routinely built from empty triage and frozen,
showing "nothing needs you" all day while act-items exist — the exact ADHD failure the
project's rules name. The docstring even claims "only overwrite with a real result"; the
code does not.
**Fix:** only cache authoritative results — skip caching when the model threw, when
`!modelAvailable()`, or when triage for today was absent at compute time; or flag the snap
`partial` and have `getMorningBrief` re-kick on a flagged/empty snap.

### 2. ✅ VERIFIED — The Doctor reports a broken connector as "Working"
`sidecar/server.ts` runDiagnostics (~L620) + `sidecar/connectors.ts` getInbox L316
**High · honesty-rule · this session's code.** Connectors return `connected: creds-present`,
not `call-succeeded` (`getInbox`: `connected: connectedAccounts.length > 0`). `runDiagnostics`
maps that straight into the health verdict, and `summarizeHealth` returns `live` whenever
`connected` is true — so an expired-token Gmail (creds present, every call 401ing) shows as
**"Working."** This defeats the entire purpose of the self-diagnostic built this session.
**Fix:** in `runDiagnostics`, treat a connector as connected only when `data.connected && !data.error`,
so a creds-present-but-erroring connector falls through to the error classification with its
fix hint. (Same applies to calendar/drive/slack/trello/buffer/github probes.)

### 3. ✅ VERIFIED — A single far-future Trello due date manufactures daily false urgency
`sidecar/brief.ts` pressingCards L38-40
**High · honesty-rule · this session's code.** `pressingCards` keeps `c.urgent || c.due` —
*any* card with *any* due date, including one due next month. That card makes
`buildBriefInput` non-empty **every day**, defeats the brief's empty-gate, and fires a daily
false "brief ready" notification — fabricated urgency, against the no-mock/ADHD rules. The
comment says "overdue/due-dated or urgent" but the code doesn't bound to overdue/soon.
**Fix:** keep a due-dated card only when `urgent` or the due date is within a near window
(e.g. overdue or due within ~48h of "now"); pass `now` in.

### 4. configuredDaysOff() reads the wrong kv store under Tauri
`sidecar/server.ts` L362-378 · **High · honesty-rule · this session's gating.** Unverified but
plausible: `configuredDaysOff()` reads the sidecar's file-kv, but under Tauri the renderer
persists settings to the Rust SQLite kv the sidecar can't read — so it always falls back to
the hardcoded `[Sun, Tue]` default. Both the scheduled brief and the notification day-off
gate (and the `/brief` `dayOff` flag) then ignore the user's configured days off — a
LOCKED-RULE violation ("initiates nothing on configured days off"). **Fix:** give the sidecar
an authoritative `daysOff` — renderer POSTs effective settings on change/boot (as it already
does with `learned`), or Tauri passes it via env at spawn. *Needs a second look at the
storage backend routing before acting.*

### 5. sendGmail silently sends from the wrong account on an unknown role
`sidecar/connectors.ts` ~L1114 · **High · correctness.** Unverified: when the requested
account role doesn't match a configured account, `sendGmail` falls back to the first
configured Gmail account — sending mail from the wrong identity. Given the app has 5 Gmail
identities and the nudge/draft flows pass an `account`, a mismatch would send as the wrong
persona. **Fix:** fail closed (return an error) on an unresolved account rather than
defaulting. *Verify the resolution logic.*

### 6. creds.json written with default (world-readable) permissions
`sidecar/creds.ts` ~L99 · **High · security.** Unverified: unlike other secret-bearing files
(backups use `0o600`), `creds.json` may be written with default perms. **Fix:** write with
`{ mode: 0o600 }` and `chmod` on existing files. *Verify current write mode.*

### 7. OAuth loopback flow has no `state` and no PKCE
`sidecar/google-oauth.ts` ~L129/172 · **High · security.** Unverified: the 127.0.0.1 code
catcher accepts any authorization code in its callback window (account-fixation / forged-code
risk), and the `error` query param may be interpolated into the callback HTML unescaped
(reflected XSS). **Fix:** add a `state` nonce + PKCE `code_verifier`; HTML-escape any
reflected query param. *Verify against the current flow.*

---

## Medium (condensed — unverified unless noted)

- **Prompt-injection in the brief** — `brief.ts` L66: untrusted Slack text / waiting subjects
  are embedded with raw newlines into the plain-text model prompt, letting external content
  forge `INBOX:`/`SLACK:` sections. Sanitize newlines/section-like lines before embedding.
- **Emergency notifications can re-fire** — `notify.ts`: the fired-keys ledger prunes at 3
  days but Slack triage retains messages ~4 days, so a still-present emergency re-fires on day
  4 (violates "fire once"). Align the prune window with triage retention (or key by date).
- **scheduledTriageRefresh bypasses inflight-dedup** — `server.ts` L443: scheduled + endpoint
  refreshes of the same cache run concurrently → duplicate model spend and the Slack 429 burst
  the sequential code avoids. Route the scheduled path through the same `inflight` kick.
- **/transcribe uses spawnSync** — `server.ts` L1299: blocks the whole event loop during
  transcription, freezing every endpoint and in-flight SSE. Use async `spawn`/`execFile`.
- **Unbounded request bodies** — `server.ts` L818: `readBody`/`readRawBody` buffer with no
  size cap; origin-less requests are accepted → local OOM DoS. Enforce a per-route byte cap
  (413 on exceed).
- **postSlack wrong-workspace fallback** — `connectors.ts` L1216: unknown `workspace` falls
  back to the first workspace; `#name` can then resolve to a same-named channel in the wrong
  workspace. Fail closed on unknown workspace.
- **Per-account Gmail failures swallowed** — `connectors.ts` L310: if any account returns
  mail, other accounts' errors vanish — one expired account silently drops from inbox, search,
  and silence detection. Surface per-account status.
- **getCalendar/getDrive discard the OAuth error** — `connectors.ts` L613: report
  `connected:false` with no error, so "broken sign-in" == "never set up" (feeds finding #2).
- **Non-atomic creds.json write + swallowed load failure** — `creds.ts` L66: can permanently
  wipe stored credentials. Write to a temp file + rename; don't silently reset on parse error.
- **Guard day-off has two sources of truth** — `guard.ts` L36: the action guard reads
  `XANI_DAYS_OFF` env (unset = disabled) while the user setting lives in kv — they can
  disagree. Unify on one authoritative source (see #4).
- **voice-harvest dedupe + shared-EMPTY mutation** — `voice-harvest.ts` L133/211: `loadCorpus`
  shallow-copies a module-level `EMPTY` so all "fresh" corpora share nested objects; task pairs
  append without dedupe and evict unique older pairs. Deep-clone; dedupe on append.
- **runClaudeStream stdin EPIPE crash** — `llm.ts` L168: no `error` handler on `child.stdin`;
  a fast-exiting CLI's EPIPE crashes the sidecar. Attach an `error` handler.
- **htmlToText double-decodes entities** — `html.ts` L18: decodes `&amp;` before `&lt;/&gt;`,
  materializing literal `<script>` in "plain text". Decode `&amp;` last.
- **Home: draft reply for HTML-only emails uses the subject only** — `page.tsx` L516:
  bypasses `emailBodyText`, so the model drafts from the subject line. Use the body helper.
- **Home: Track/Not-for-me don't update the persisted triage cache** — `page.tsx` L472:
  dismissed/tracked items resurrect on next launch and re-tracking duplicates the loop. Persist
  the mutation.
- **Home: persisted triage shown as live when runtime says disconnected** — `page.tsx` L323:
  no age bound on the cache. Bound age; badge stale/last-known.
- **Home (adhd-ux): snoozed loops never resurface while Home stays mounted** — `page.tsx`
  L270: in a resident tray app, "Not now"/"Tomorrow" silently break their promise. Re-eval
  `activeLoops` on an interval / when the snooze elapses.

## Low (one line each — unverified)

- `deadline.ts` L40 — `normalizeDeadline` accepts past dates back to 2020; a hallucinated past
  deadline reaches the UI as a bogus overdue chip. Reject dates far in the past.
- `brief.ts` L46 — `BRIEF_ITEM_CAP` slices the newest 8 act-items with no priority order; the
  item with today's hard deadline can be dropped. Sort by due before slicing.
- `page.tsx` L92 — `DueChip` computes day boundaries in machine-local tz, not the configured
  profile tz used elsewhere. Use the profile tz.
- `page.tsx` L268 — greeting prerendered with the build machine's clock in a static export →
  hydration mismatch. Compute client-side.
- `page.tsx` L277 — `toggleExpand` permanently caches transient fetch failures; can't retry in
  session. Don't cache the failure sentinel.
- `page.tsx` L777 — Slack "See full message" fetches recent channel messages without the ts;
  the pane can omit the expanded message. Fetch by ts/thread.
- `server.ts` L340 — `lastLearned` resets to `[]` on boot; the boot tick re-triages without
  corrections, overwriting the curated snapshot. Persist `lastLearned` with the triage cache.
- `connectors.ts` L321 — cache-version stamp read after the fetch → a mid-flight credential
  change can cache stale-cred data as fresh.
- `connectors.ts` L981 — `markSlackRead` builds a `WebClient` without `SLACK_WC_OPTS`,
  reintroducing the unbounded rate-limit retry the file bans.
- `llm.ts` L251 — Gemini key sent as a URL query param (leaks into logs/proxies). Use a header.
- `static.ts` L68 — static ReadStream has no `error` handler → a read error after `statSync`
  crashes the sidecar. Attach one.
- `static.ts` L103 — the path-traversal guard has zero test coverage. Add tests.

---

## Completing the audit (10 units + verification never ran)

Re-run after the limit resets (20:50 UTC): the workflow script is at
`scratchpad/xani-audit.mjs`; `Workflow({scriptPath, resumeFromRunId: 'wf_b82a096d-95c'})`
replays the 6 cached reviewers and runs only the missing work. Still needed:
- **Reviewers:** client-contract, memory/learning, lib-infra, other-pages.
- **Cross-cutting sweeps:** prompt-injection, concurrency/SWR, secrets/auth, honesty-UX,
  error-handling/type-safety, dead-code/architecture.
- **Adversarial 3-lens verification** of every finding above (none ran), then the completeness
  critic and dedupe/synthesis.

## What looked solid (from the completed reviewers)
No critical (RCE/auth-bypass/secret-to-renderer) issues surfaced in the reviewed areas. The
settled anti-RCE choice (model never gets a tool-loop over untrusted content) held up; the
pure modules' logic was sound apart from the bounded issues above; the capability-token gate
and origin allowlist were not faulted by the security/model reviewers.
