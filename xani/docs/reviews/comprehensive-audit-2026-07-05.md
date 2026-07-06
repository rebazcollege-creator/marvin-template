# Xanî — Comprehensive Audit (Fable 5, multi-agent) — 2026-07-05

## Status: COMPLETE (reviewers) · verification partial · report synthesized manually

A 16-reviewer Fable 5 audit with 3-lens adversarial verification was run. **All 16
reviewers completed** — 98 raw findings, **68 unique after de-duplication**. The
adversarial verification ran on a subset (**10 findings confirmed, 2 refuted**) before
**Fable 5 usage credits were exhausted**; the completeness-critic and auto-synthesis did
not run, so this report was **assembled and cross-checked by hand** (on Opus 4.8) from the
reviewers' output. The highest-severity items were **verified directly against the code**,
not just by the swarm vote.

### Methodology
- **Reviewers (16):** 10 area reviewers (server, connectors, this session's new pure
  modules, security, model-layer, home, client-contract, memory/learning, lib-infra, other
  pages) + 6 cross-cutting sweeps (prompt-injection, concurrency/SWR, secrets/auth,
  honesty-UX, error-handling/type-safety, dead-code/architecture).
- **Verification:** each finding attacked from 3 lenses (does it occur at runtime? is the
  severity honest? is there a guard the finder missed?); dropped only on a majority refute.
- Reviewers were briefed on the settled architecture (server-side-search anti-RCE choice,
  secrets-never-in-renderer, empty-states-only, days-off) so deliberate decisions aren't
  flagged as bugs.

### Severity tally (unique)
1 Critical · 22 High · ~30 Medium · ~15 Low.

---

## Already fixed this session (verified against code + tested)

| # | Finding | File | Commit |
|---|---------|------|--------|
| 1 | **Morning brief froze all day on a false "you're clear"** (unconditional cache of a premature/failed generation) | `sidecar/server.ts` | `3f0605d` |
| 2 | **Doctor reported a broken connector as "Working"** (`connected` = creds-present, not call-succeeded) | `sidecar/server.ts` diagnostics | `0324c57` |
| 3 | **A far-future Trello due date manufactured daily false urgency** (`pressingCards` kept any due date) | `sidecar/brief.ts` | `3f0605d` |
| 4 | **CRITICAL: editing a draft in Approvals sent the ORIGINAL text** (payload sync gated on `voiceKey`) | `src/app/approvals/page.tsx` | this commit |

Each was reproduced in the code, fixed, type-checked, and (for the sidecar three) covered
by tests / live-smoked. #4 is the most urgent for a journalist: a rewritten email/Slack
message no longer sends its pre-edit text.

---

## Remaining findings (ranked; unfixed)

The items below are the reviewers' findings, de-duplicated and ranked. Those in **bold** as
CRITICAL/HIGH warrant action; the highest ones I've spot-verified are noted inline where I
fixed them above. Everything here is a candidate for the next fix pass — none has been
changed yet.

## CRITICAL (1)

### `src/app/approvals/page.tsx:98` — correctness
**Editing a draft in Approvals silently sends the ORIGINAL text: the edit is only written into the payload when the item has a voiceKey, but most enqueuers (ComposeModal, Slack composer, inbox AI-draft reply) never set voiceKey**

saveEdit()'s syncPayload bails out for any item without a voiceKey: `if (!it.voiceKey || !it.payload) return { ...it, preview: draft };` — it updates only the displayed preview, not the executable payload. voiceKey is set only by the home-page loops (src/app/page.tsx:532,553,578). Every other payload-bearing enqueue has no voiceKey: ComposeModal.tsx:37-44 (kind 'email' with body), slack/page.tsx:151-160 (kind 'slack' with text), inbox aiDraftReply routes through ComposeModal too. So the user edits the message body in Approvals, sees the edited text in the preview and in the ConfirmModal `detail`, clicks approve — and actMarvin() executes the original unedited payload. An outbound email/Slack message goes out with content the user explicitly rewrote away. This is exactly the honesty violation the queue exists to prevent. (Additionally, even voiceKey'd 'task' payloads fall through the else

*Fix:* In syncPayload, sync the edit into the payload for ALL payload kinds based on payload.kind (email→body, slack→text, social→caption, task→name/description), independent of voiceKey; keep voiceKey only as the voice-learning trigger.


## HIGH (22)

### `sidecar/server.ts:644` — honesty-rule
**Doctor diagnostics reports failing connectors as "Working." because connectors' `connected` means creds-present, not call-succeeded**

Every connector returns `connected: true` whenever credentials exist, even when the live call failed (getInbox line 316 `connected: connectedAccounts.length > 0`; getTrello/getBuffer/getGithub return `{ connected: true, ..., error: 'API 401' }` on HTTP failure). runDiagnostics feeds that value straight into ProbeResult.connected, whose contract (diagnostics.ts:17) is "Whether a live call actually succeeded." summarizeHealth (diagnostics.ts:57) checks `if (p.connected) return ... 'Working.'` BEFORE looking at `error`, so a connector with all tokens revoked or a hard 401 shows status 'live', detail 'Working.'. The Doctor's stated purpose — "sign-in expired, reconnect it" instead of a silent blank — is defeated for exactly the expired-token case it was built for; classifyError's auth branch is unreachable for these connectors.

*Fix:* In runDiagnostics compute `connected: inbox.connected && !inbox.error` (same for trello/buffer/github/slack), or have summarizeHealth treat a present `error` as status 'error' even when connected is true.

### `sidecar/connectors.ts:1114` — correctness
**sendGmail silently falls back to the first configured Gmail account when the requested account role doesn't match, sending mail from the wrong identity**

`const acct = GMAIL_ACCOUNTS.find((a) => a.role === p.account) ?? GMAIL_ACCOUNTS.find((a) => gmailCreds(a.n));` — the fallback is intended for `p.account === undefined`, but it also fires for ANY unrecognized string (case mismatch, display name, renderer/protocol drift). The sidecar is the trusted enforcement side (guard.ts validates only `kind`, not account), and the renderer is explicitly untrusted; an approval card that said "send as leadstories" can execute as the personal account with zero error. Identity of the From account is safety-relevant for this user (personal vs LeadStories vs Moonshot separation is a hard constraint of the project).

*Fix:* If `p.account` is provided and matches no GMAIL_ACCOUNTS role, return { ok: false, error: `Unknown Gmail account "${p.account}".` } instead of falling back. Apply the same rule in postSlack/slackClientFor.

### `sidecar/server.ts:502` — correctness
**A failed, premature, or provider-less morning-brief generation is cached with today's forDate and is never regenerated for the rest of the day, freezing Home on a false "you're clear" state**

computeMorningBrief() returns `base` ({text:'', forDate: today}) in three non-authoritative cases: no model provider (line 474), oneShot throwing (lines 496-498), and — worst — when triageState.inbox/slack are still null/stale because the brief is computed before triage finishes (lines 476-477 read the cache directly with no await on triage). refreshMorningBrief() then caches that snapshot UNCONDITIONALLY (`triageState.brief = snap`) and persists it to disk, despite its own docstring saying "only overwrite with a real (non-empty OR genuinely-clear) result". Once cached with forDate === todayKey(), getMorningBrief() returns it without kicking a refresh (line 518 `if (snap && isToday) return snap;`) and scheduledTriageRefresh() also skips regeneration (line 447 `triageState.brief?.forDate !== todayKey()` is false). There is no retry path until midnight. This is the common boot flow, not an

*Fix:* In refreshMorningBrief, only cache when the result is authoritative: skip caching when oneShot threw, when !modelAvailable(), and when triage snapshots for today were absent at compute time (or make computeMorningBrief await fresh-enough triage). Alternatively add a `failed`/`partial` flag to BriefSnap and have getMorningBrief kick a re-generation when the cached snapshot is flagged.

### `sidecar/server.ts:368` — honesty-rule
**configuredDaysOff() reads the sidecar's file kv, but under Tauri (and Next-dev) the renderer persists settings only to the Rust SQLite kv / localStorage — so the heartbeat and notification gate always use the hardcoded default [Sun, Tue], violating the locked day-off rule**

configuredDaysOff() looks for a `xani.settings*` key in the sidecar's own kvAll() (sidecar/kv.ts JSON file). But src/lib/storage.ts routes ALL renderer persistence to the Rust SQLite kv when isTauri() (backendSet line 179: `if (isTauri()) return tauriInvoke('kv_set', ...)`) — the sidecar's JSON kv is only written in browser 'service mode'. In dev mode the /kv call 401s (no token) and settings stay in localStorage. So in the packaged app — the shipping target — the sidecar NEVER sees the user's daysOff edits and permanently falls back to `[0, 2]`. Both day-off gates are fed by this: the scheduled brief generation (line 447) and decideNotifications' `dayOff` input (line 612), plus the `dayOff` flag returned by /brief (line 917). CLAUDE.md lists "Days off: user-configured — MARVIN initiates nothing" as a hard constraint and LOCKED_RULES says "Take no initiating action on the user's configur

*Fix:* Give the sidecar an authoritative copy of daysOff regardless of storage backend — e.g. the renderer POSTs effective settings to a sidecar endpoint on change/boot (like it already does with `learned`), or Tauri passes daysOff via env/argument at spawn and on settings change.

### `sidecar/brief.ts:39` — honesty-rule
**pressingCards keeps any card with any due date, so a single far-future Trello due date manufactures daily false urgency, defeats the brief empty-gate, and fires a daily 'brief ready' notification**

The brief labels its Trello section 'TRELLO (overdue / due today)' (brief.ts:73) and BRIEF_SYSTEM asks the model for 'what genuinely needs him TODAY', but pressingCards keeps every card that has ANY due date: `return cards.filter((c) => c.urgent || c.due);`. getTrello (connectors.ts:1046) returns all board cards with `due: c2.due ?? null` — no date-window filtering — and `urgent` is only the <36h flag (connectors.ts:1045), so the `|| c.due` arm admits cards due weeks or months out. Consequences chain: (1) buildBriefInput's empty-gate (brief.ts:52) can never return `empty:true` while any card on the board carries a due date, so the calm 'you're clear' state becomes unreachable and a model call is made every day; (2) the model is handed a far-future card under an 'overdue / due today' header, i.e. the data block itself lies to the model, inviting a fabricated-urgency bullet; (3) `hasConten

*Fix:* In pressingCards, keep a due-dated card only when its due date is <= end of today (or reuse the urgent 36h horizon): `cards.filter((c) => c.urgent || (c.due && new Date(c.due).getTime() <= endOfTodayMs))` with `now` injected for testability; add a test with a card due next month asserting it is dropped and that a board with only far-future cards yields empty:true.

### `sidecar/creds.ts:99` — security
**creds.json is written with default file permissions (typically world-readable), unlike every other secret-bearing file in the sidecar**

persist() writes the credential store — Anthropic API key, OAuth client secrets, Gmail/Drive/Calendar refresh tokens, Slack user tokens, GitHub token — with no mode option, so on a default umask 022 it lands as 0644. This is inconsistent with the rest of the codebase, which deliberately sets owner-only mode: kv.ts writes kv.json with `{ mode: 0o600 }` (kv.ts:38, :93) and scheduler.ts writes backups with `{ mode: 0o600 }` (scheduler.ts:50, comment: 'Owner-only file mode'). The DATA_DIR 0o700 mkdir in paths.ts only protects when paths.ts itself created the directory; with XANI_DATA_DIR overridden ('tests, portable setups' per paths.ts:17) or a pre-existing directory, creds.json is readable by any local user. migrateLegacyFiles also copies the legacy .xani-creds.json with copyFileSync, preserving whatever (likely 0644) mode the repo-folder file had.

*Fix:* Pass `{ mode: 0o600 }` in persist(), and chmod the file after migrateLegacyFiles copies it (or use tmp-write with mode + rename, matching kv.ts).

### `sidecar/google-oauth.ts:172` — security
**OAuth loopback flow uses neither a state parameter nor PKCE, so the 4-minute callback window accepts forged authorization codes from any local process or drive-by web page**

startOAuthLogin builds the authorization URL with only client_id/redirect_uri/response_type/scope (line 169-172) — no `state` nonce and no PKCE code_challenge — and the token exchange (line 134-139) sends no code_verifier. The HTTP handler exchanges ANY `code` query param that arrives on 127.0.0.1:8788 (line 129: `if (!code) ... return`; otherwise it exchanges it). RFC 8252 §8.9 mandates PKCE (and effectively state) for exactly this native loopback pattern. The client_id is not secret: openBrowser passes the full auth URL as a process argument to xdg-open/open (line 78-86), visible in the process list to any local user, and it transits browser history. An attacker who knows the client_id can mint a valid code for an attacker-controlled Google account and deliver it to the listening server (e.g. a web page doing `fetch('http://127.0.0.1:8788/?code=...')` or an `<img>` — no CORS needed for

*Fix:* Generate a random `state` and a PKCE code_verifier per login; include state+code_challenge(S256) in the auth URL, reject any callback whose state does not match, and send code_verifier in the token exchange. Also reject callbacks on paths other than '/'.

### `src/app/page.tsx:270` — adhd-ux
**Snoozed loops never resurface while Home stays mounted — 'Not now' and 'Tomorrow' silently break their promise in a resident tray app**

The 30s interval only updates `now` (line 268-272); `loops` state is refreshed exclusively by `reloadLoops` on mount and on `xani:loops-changed` events (lines 290, 344). `activeLoops()` (open-loops.ts:88-91) evaluates `snoozedUntil <= now` only at call time, and nothing in the app re-invokes it periodically (verified: Watcher.tsx/watcher.ts never touch the loops store; loops-monitor runs once on mount). So a loop snoozed 3h via 'Not now' (line 650), the LoopCard snooze (line 874), or 'Tomorrow' on the stale card (line 840) will never reappear as long as the window sits open — and the file's own comment says this is a resident tray app open for hours. This silently breaks the core working-memory contract ('stays visible until it is genuinely done').

*Fix:* Call reloadLoops() inside the 30s tick (or add `now` to a memo that re-derives loops), so snooze expiry is re-evaluated on the existing clock.

### `src/lib/marvin-data.ts:26` — correctness
**marvin-data.ts hardcodes localhost:8787 and ignores the remote /__mv reverse proxy, so every data view breaks when the app is served remotely**

marvin-client.ts resolves the sidecar URL via resolveSidecarUrl(), which routes to `${origin}/__mv` when the page is opened from a non-loopback host (the supported remote mode implemented by scripts/serve-remote.mjs, whose header comment explicitly points at resolveSidecarUrl). marvin-data.ts duplicates the constant instead of sharing it and skips the proxy logic entirely. In remote hosting, 'localhost' is the viewing device (e.g. a phone), so every fetch in marvin-data.ts — /data/briefing, /data/inbox (+folders/pagination), /data/trello, /data/calendar, /data/drive, /data/slack (+history), /data/buffer, /data/github, /data/message bodies, draftReply, summarizeThread, markSlackRead — fails, while the marvin-client.ts endpoints keep working. The user sees a half-working app: Home brief/triage load but Inbox, Slack, Calendar, Drive, Trello, Buffer, GitHub all show offline/empty.

*Fix:* Delete the local constant and `import { SIDECAR_URL } from '@/lib/marvin-client'` (or move resolveSidecarUrl into a shared module) so both files use identical resolution.

### `src/lib/marvin-data.ts:114` — concurrency
**invalidate()/clearDataCache() do not cancel or fence in-flight fetches, so stale data — including a just-disconnected account's mail — repopulates the cache and localStorage after invalidation**

get() unconditionally writes `cache.set(path, ...)` and `persist(...)` when its fetch resolves, with no check that the entry was invalidated while the request was in flight. clearDataCache() (documented: "so a removed account's mail can't linger in the UI") clears cache + localStorage but never touches the `inflight` map or aborts requests, and invalidate() only deletes the inflight map entry (the underlying fetch keeps running and still writes the cache on completion). Two concrete consequences: (1) disconnecting a Gmail account (connections/page.tsx:162 clearDataCache('/data/inbox')) while the LivePreview poll or an inbox view fetch is in flight re-caches and re-persists the removed account's messages, which peekData() then paints for up to 24h — defeating the stated privacy guarantee; (2) after invalidate() in useLiveData.refresh/revalidate, the pre-invalidation fetch's `finally { inf

*Fix:* Version the cache: capture a generation counter (or token) per path when the fetch starts; bump it in invalidate()/clearDataCache(); in get()'s success path only cache/persist when the generation still matches. Guard the finally the same way (only delete inflight if it still points at this promise).

### `src/lib/triage-learning.ts:39` — prompt-injection
**Attacker-controlled sender field is embedded verbatim into high-trust, immediately-active memories that are injected into the triage system prompt — the exact poisoning vector the code claims to have closed**

recordTriageCorrection and recordSenderRule interpolate `input.from` raw into the rule text, ingest it with source:'correction' (write-gate: trusted -> active immediately, trust 'high', no approval step), and triageLearnings() feeds those strings into the triage SYSTEM prompt via sidecar withLearnings (server.ts:305-311, 'Rebaz has corrected you before — apply what you've learned'). The doc comment (lines 22-27) says the rule 'quotes only the SENDER, never the message's own subject/text' to prevent memory poisoning — but the sender field IS attacker-authored free text: for email it is the raw RFC-5322 From header including the arbitrary display name (connectors.ts rowFromMessage: `from: header('from')`, line 230), and for Slack it is the sender's self-chosen display name. One tap of 'Not for me' or 'Track it' on a crafted message (page.tsx:468/475/496/503 pass m.from straight through) pe

*Fix:* Before phrasing the rule, reduce `from` to a parsed, validated email address (or Slack user ID), strip/escape quotes and newlines, and cap length (e.g. 80 chars). Treat display names as untrusted data like subjects.

### `src/app/settings/page.tsx:133` — correctness
**Remove Gemini key is a no-op in the desktop (Tauri) build — the runtime keeps routing all AI traffic to Gemini while the UI claims it switched back to Claude**

saveGeminiKey() has a Tauri branch (`invoke('set_integration_cred', { name: 'GOOGLE_AI_API_KEY', value: v })`) and a dev branch (setRuntimeCred). removeGeminiKey() only has the dev branch: `if (!isTauri()) await setRuntimeCred('GOOGLE_AI_API_KEY', '')` — in the packaged app nothing is invoked at all; it just flips local state `setGeminiStored(false)`. The Gemini key stays in the keychain/runtime, the collapsible summary reverts to 'Free testing without Anthropic credits', and per the page's own copy ('When a key is set here, triage, drafting, summaries and chat all route to Gemini') every subsequent AI call keeps going to Google while the user believes they returned to Claude — a privacy/routing lie, not just a stale label.

*Fix:* Mirror saveGeminiKey: in Tauri, `await invoke('set_integration_cred', { name: 'GOOGLE_AI_API_KEY', value: '' })` before flipping local state, and only flip state on success.

### `src/lib/connect-flows.ts:235` — honesty-rule
**Generic connect fallback silently discards the pasted API token while the UI claims it was stored in the keychain and marks the integration connected**

methodsFor()'s generic fallback (used by every integration without a bespoke flow: notion, linear, hubspot, zoom, whatsapp) defines its token field WITHOUT an envKey: `fields: [{ key: 'token', label: `${name} API token`, type: 'password', ... }]`. In ConnectFlow.finish() (src/components/connections/ConnectFlow.tsx:80) the persistence loop is `if (!f.envKey || !v) continue;` — so the pasted secret is dropped on the floor, never written to the keychain (Tauri) or the sidecar (dev). Yet the form step displays the fixed copy 'These are stored in your OS keychain when packaged (or your local .env in dev) and read only by MARVIN's runtime.' (ConnectFlow.tsx:331) and finish() then calls onComplete({connected: true, ...}) showing the success screen. credKeysFor() returns [] for these ids, so nothing can even be cleared later. This is a direct violation of the project's honesty rule ('No fake con

*Fix:* Either give the fallback field a real envKey convention (e.g. `${ID.toUpperCase()}_TOKEN`) that the sidecar reads, or refuse to render a token form for integrations with no runtime consumer and say honestly that this integration isn't wired yet.

### `src/lib/triage-learning.ts:39` — prompt-injection
**Attacker-controlled email/Slack sender name is embedded verbatim into a trusted, active triage system prompt (memory poisoning)**

When Rebaz files or tracks a triaged item, recordTriageCorrection()/recordSenderRule() build a rule string that interpolates the raw sender identity `input.from` inside quotes (e.g. `Rebaz filed a ${where} from "${input.from}" as not needing him...`) and writes it via ingestMemory with source:'correction'. That source is graded high-trust and status:'active' immediately (memory.ts:151-176) — it bypasses the write-gate/approval path entirely. triageLearnings() then feeds every correction memory back into the triage system prompt via withLearnings() (server.ts:305-313, 768/793). `input.from` is the email `From` header display name (connectors.ts:224/230 `header('from')`) or the Slack display name — both fully attacker-controlled. The module's own docstring (lines 22-27) recognises this exact hazard and deliberately excludes the `subject`, but leaves `from` — which is equally attacker-autho

*Fix:* Do not interpolate raw sender identity into the trusted triage prompt. Either key corrections to a sanitized/normalized bare email address (extractEmailAddress already exists in mail.ts) with control chars and quotes stripped, or store the sender as structured data matched in code rather than as free text spliced into the system prompt. Add a test asserting a From display name containing quotes/newlines/'ignore previous' cannot alter the emitted rule string.

### `sidecar/server.ts:504` — correctness
**refreshMorningBrief caches a transient failure (or cold-boot empty state) as today's brief, locking out regeneration until midnight**

The comment on refreshMorningBrief says 'only overwrite with a real (non-empty OR genuinely-clear) result', but the code caches unconditionally. computeMorningBrief returns `base` ({at, forDate: today, text: ''}) when !modelAvailable() (line 474) and in its catch when the oneShot model call throws (lines 496-498). refreshMorningBrief then does `triageState.brief = snap; persistTriage()` with no guard. Once an empty snapshot carries today's forDate, getMorningBrief (line 518: `if (snap && isToday) return snap;`) returns it without kicking a refresh, and scheduledTriageRefresh (line 447: `triageState.brief?.forDate !== todayKey()`) skips regeneration. There is no retry path for the rest of the day. The cold-boot variant is worse: at the first scheduler tick after a sidecar restart, if triage snapshots are still null/failed, inboxActs/slackActs are empty and an 'empty' brief is stamped for 

*Fix:* In refreshMorningBrief, only assign triageState.brief when the compute was authoritative: skip caching when the model threw, when !modelAvailable(), or when both triage snapshots were absent at compute time (return the failure without caching, like refreshInboxTriage does). Alternatively mark the snap `partial` and have getMorningBrief/scheduledTriageRefresh re-kick on a partial/empty snap.

### `sidecar/server.ts:790` — correctness
**Inbox/Slack triage treats a transient all-accounts upstream failure as a genuine empty result and caches it over the last good snapshot (also destroying the disk snapshot)**

The SWR design comment (server.ts:319-321) promises 'Only a real connected result is cached, so a transient error never overwrites a good snapshot', and refreshInboxTriage/refreshSlackTriage guard on `data.connected && !data.error`. But computeInboxTriage drops the upstream error: getInbox returns `{connected: connectedAccounts.length > 0, messages: [], error: errs[0]}` when every account's fetch failed (connectors.ts:309-316 — connected reflects creds-present, not call-succeeded), and computeInboxTriage (server.ts:789-790) does `if (msgs.length === 0) return { connected: true, triaged: [] };` — the inbox.error is discarded, so the guard passes and an empty triage replaces the good snapshot AND is persisted via persistTriage(), so even a restart can't recover the previous good data. Identical hole for Slack: computeSlack returns connected:true with error when all workspaces errored (conn

*Fix:* Propagate the upstream error: in computeInboxTriage return `{ connected: true, triaged: [], error: inbox.error }` when msgs.length===0 && inbox.error (and similarly pass slack.error through in computeSlackTriage when scan is empty), so the existing `!data.error` cache guard rejects it. A zero-message result with no upstream error remains cacheable as genuinely clear.

### `src/app/page.tsx:323` — honesty-rule
**Home renders a false all-clear ("Nothing in your inbox needs you right now") from a stale cache when Gmail/Slack is disconnected or the runtime is down**

The triage cache (xani.triage.inbox.v1 / xani.triage.slack.v1) is written on every successful triage, including when acts=[] (lines 329, 340). On the next launch it seeds state (lines 313-316) and then every failure path in the revalidation deliberately returns without setting an error whenever a cache exists: runtime unreachable (line 321/333), connected === false (line 323/334), and triage error (line 324/335). With a cached empty acts list, the UI takes the `!inboxLoading && !inboxErr && inboxActs.length === 0` branch (lines 706-711) and renders "Nothing in your inbox needs you right now. N good to know · M filed as noise." — yesterday's counts presented as a current all-clear while Gmail is actually disconnected or the sidecar is dead. This is exactly the case the code's own comment forbids: a real error rendered as an innocent empty state. Non-empty caches have the same problem (sta

*Fix:* When revalidation reports disconnected/unreachable/error, keep cached items if you must, but always surface the condition (set inboxErr or a visible 'showing yesterday's triage — Gmail not reachable' banner) instead of returning silently; never render the all-clear sentence from a cache that failed revalidation.

### `src/lib/watcher.ts:80` — adhd-ux
**Watcher permanently swallows notifications that arrive during days off, quiet hours, focus sessions, or the 90-min cooldown — items are marked seen before the nudge gate, contradicting its own "they wait quietly" comment**

runWatch() pushes every new important item's id into the seen set (lines 54, 71) and persists it with saveSeen(s) at line 80 — BEFORE the notifyEnabled()/canNudge() gate at lines 82-85. When canNudge() is false (day off, before 08:00/after 21:00, focus session open, or within 90 minutes of the last batch), the pings array is discarded but the items are already recorded as seen, so no later pass will ever notify about them. The comment claims the opposite: "New items are still recorded above — they wait quietly." They don't wait — they are silently dropped forever. Since runWatch fires every 60 seconds, any two important messages more than 90 minutes apart lose the second one's neighbours arriving inside the cooldown, and everything arriving overnight or on a day off is never surfaced as a notification. For the app's core promise ("Xanî pings you instead of you checking the apps") this me

*Fix:* Persist pending (unnotified) pings separately from the seen set, and deliver them (or one batch summary) on the first pass where canNudge() is true; only move an item to 'seen' after it has actually been notified or shown.

### `sidecar/llm.ts:168` — error-handling
**Claude CLI subprocess stdin has no 'error' handler — an EPIPE while writing the prompt crashes the entire sidecar process**

runClaudeStream() attaches handlers to child.stdout, child.stderr, and the child itself, but never to child.stdin. `child.stdin.write(input)` then `child.stdin.end()` are fired unconditionally. If the `claude` process exits before draining stdin — headless CLI not logged in ('Please run /login', exits 1), a CLI flag rejected after an update, or the module's own 120s timeout doing `child.kill('SIGKILL')` (line 148) while a large prompt (>64KiB pipe buffer, easy for a long /chat conversation flattened by claudeCliGenerate) is still buffered — Node emits an 'error' (EPIPE) event on the stdin stream. With no listener, an unhandled 'error' event is thrown as an uncaught exception. The promise's reject() cannot catch it (it is an async event, not a throw in the executor), and server.ts installs no process-level uncaughtException handler — so the whole sidecar dies. In single-port service mode 

*Fix:* Add `child.stdin.on('error', (e) => { clearTimeout(timer); reject(e); });` (or a no-op swallow plus reject via the existing close handler), and wrap the write/end in try/catch. Optionally add a process-level uncaughtException/unhandledRejection guard in server.ts that logs instead of dying.

### `sidecar/server.ts:502` — correctness
**Morning brief generated before triage warm-up is cached for the whole day and never regenerated — Home shows 'you're clear' while act-items exist**

computeMorningBrief() reads act-items only from the in-memory triage snapshots (`triageState.inbox/slack`, lines 476-477); it never triggers or awaits triage itself. If POST /brief arrives before the first triage has completed (fresh install with no triage-cache.json, or a boot where Home loads faster than the heartbeat), inboxActs and slackActs are empty, buildBriefInput returns empty:true, and refreshMorningBrief() caches `{forDate: today, text: ''}` unconditionally (lines 503-505 — despite the comment at 501 claiming it only overwrites with a 'real' result, there is no such check). From then on: getMorningBrief() returns the cached snap for the rest of the day without kicking a refresh (line 518 `if (snap && isToday) return snap;`), and the heartbeat skips regeneration because `triageState.brief?.forDate !== todayKey()` is false (line 447). So one early request freezes an empty (or ca

*Fix:* Don't cache a brief built from missing triage snapshots (e.g. skip caching when `triageState.inbox === null || triageState.slack === null`), or record `builtFromTriageAt` and let getMorningBrief/heartbeat regenerate when triage snapshots are newer than the brief.

### `src/lib/marvin-data.ts:26` — correctness
**marvin-data.ts duplicates the sidecar URL resolution and has drifted: it lacks the remote /__mv proxy path, so every data view breaks in the documented phone/Codespaces flow**

marvin-client.ts resolveSidecarUrl() (lines 25-38) was taught the remote-hosting case: when window.location is not loopback, the sidecar is reached same-origin at `${origin}/__mv` (scripts/serve-remote.mjs proxies it; docs/PHONE.md makes this a first-class flow, and scripts/dev-remote.mjs sets no NEXT_PUBLIC override). marvin-data.ts is a second, older copy of the same config that never got that fix. storage.ts correctly imports SIDECAR_URL from marvin-client, proving the shared constant exists and marvin-data simply drifted.

*Fix:* Delete the local constant and `import { SIDECAR_URL } from '@/lib/marvin-client'` exactly as storage.ts does.

### `src/components/marvin/MarvinChat.tsx:1` — dead-code
**MarvinChat.tsx is a dead subtree (never imported), leaving the agent's proposal/approval events with no consumer — the model is told 'Recorded as a proposed memory for the user to review on /memory' while the proposal is silently dropped**

Repo-wide grep finds zero references to MarvinChat outside its own file; no app route mounts it. It was the ONLY component that handled 'approval_request' and 'proposal' stream events, the only caller of approveMarvin()/extractLearnings() (so POST /approve and POST /extract are unreachable from the UI), and the only importer of src/lib/chats.ts (chat-history persistence — also dead). Meanwhile POST /chat unconditionally attaches the full tool registry, and all four live streamMarvin consumers (find/page.tsx:88, StudioWorkbench.tsx:104, DrafterWorkbench.tsx:65, LeadStoriesStudio.tsx:202) handle only 'text' and 'error'. When the model calls propose_memory/propose_adjustment from any live surface, agent.ts feeds back a tool_result claiming it was recorded — but nothing routes the emitted proposal to ingestMemory, so nothing lands on /memory. This violates the honesty rule: MARVIN tells Reba

*Fix:* Either mount MarvinChat (or fold its proposal/approval handling into the live surfaces), or make agent.ts return an honest tool_result ('This surface cannot record memories') when no proposal consumer exists; delete chats.ts / approveMarvin / extractLearnings / /approve / /extract if chat is intentionally gone.


## MEDIUM (46)

### `sidecar/connectors.ts:1216` — correctness
**postSlack silently falls back to the first connected workspace on unknown `workspace`, and #name resolution can then post into a same-named channel in the wrong workspace**

### `sidecar/connectors.ts:310` — error-handling
**Per-account Gmail failures are silently swallowed whenever any other account returns mail — one expired account's messages just vanish from inbox, search, and silence detection**

### `sidecar/connectors.ts:613` — honesty-rule
**getCalendar/getDrive discard the OAuth error and report `connected: false`, so a broken sign-in is indistinguishable from 'never set up'**

### `sidecar/server.ts:443` — concurrency
**scheduledTriageRefresh bypasses the inflight-dedup fields, so scheduled and endpoint-kicked refreshes of the same cache run concurrently — duplicate model spend and the exact Slack 429 burst the sequential-fetch code was written to prevent**

### `sidecar/server.ts:1299` — robustness
**/transcribe runs whisper.cpp with spawnSync inside the request handler, blocking the entire Node event loop — every other endpoint (including in-flight /chat SSE streams) freezes for the duration of transcription**

### `sidecar/server.ts:818` — security
**readBody/readRawBody buffer request bodies with no size limit, and origin-less requests are accepted — any local process can OOM-crash the sidecar (which holds pending approvals, unflushed kv writes, and all connector state)**

### `sidecar/brief.ts:66` — prompt-injection
**buildBriefInput embeds untrusted Slack message text (and waiting-thread subjects) with raw newlines into the plain-text model prompt, letting external content forge sections and fabricate brief content**

### `sidecar/notify.ts:93` — correctness
**Emergency notifications can re-fire: the fired-keys ledger is pruned after 3 days but Slack triage keeps messages for 4 days, violating the 'fire each thing ONCE' rule**

### `sidecar/google-oauth.ts:129` — security
**Loopback OAuth flow has no `state` parameter and no PKCE — the code catcher on 127.0.0.1:8788 accepts any authorization code, enabling account fixation**

### `sidecar/creds.ts:66` — error-handling
**Non-atomic creds.json write plus silently-swallowed load failure can permanently wipe every stored credential**

### `sidecar/guard.ts:36` — correctness
**Days-off policy has two disagreeing sources of truth: the server-side action guard reads XANI_DAYS_OFF env (unset = disabled) while the user's actual setting lives in kv (default Sun+Tue) — and the guard's day-off branch is currently unreachable**

### `sidecar/google-oauth.ts:126` — security
**Reflected XSS in the OAuth callback success/error page: the attacker-controllable `error` query param is interpolated into HTML unescaped**

### `sidecar/voice-harvest.ts:211` — correctness
**Voice-harvest task pairs are appended with no dedupe while every run re-reads the same newest Slack history, so duplicates accumulate and evict unique older pairs at the cap**

### `sidecar/voice-harvest.ts:133` — correctness
**loadCorpus shallow-copies the module-level EMPTY constant, so all 'fresh' corpora share (and mutate) the same nested mine/incoming/pairs/stats objects**

### `sidecar/llm.ts:168` — error-handling
**runClaudeStream writes the prompt to child.stdin with no stdin 'error' handler — an EPIPE from a fast-exiting CLI crashes the whole sidecar process**

### `sidecar/html.ts:18` — correctness
**htmlToText decodes &amp; before &lt;/&gt;, double-decoding entities so literal markup like <script> is materialized in the 'plain text' output**

### `src/app/page.tsx:516` — correctness
**Draft reply for HTML-only emails is generated from the subject line alone — the existing emailBodyText helper is bypassed**

### `src/app/page.tsx:472` — adhd-ux
**'Track it' / 'Not for me' don't update the persisted triage cache, so dismissed and already-tracked items resurrect on next launch (and re-tracking duplicates the loop)**

### `src/app/page.tsx:323` — honesty-rule
**Persisted triage cache has no age bound and is shown as live even when the runtime reports Gmail/Slack disconnected**

### `sidecar/server.ts:925` — correctness
**The /brief endpoint generates a morning brief (model call) on days off, bypassing the day-off guard the heartbeat honours — and the client calls it unconditionally**

### `src/lib/marvin-data.ts:38` — robustness
**Every inbox folder+cursor page is persisted to localStorage under a unique key and never evicted — unbounded growth that eventually silently disables the instant-paint cache**

### `sidecar/server.ts:306` — correctness
**Sidecar caps injected learnings at 25 total, so understandingFacts (Train answers) are silently dropped from triage once corrections reach 25 — the Understanding loop stops having any effect**

### `src/lib/memory.ts:158` — security
**ingestMemory write-gate does not enforce its documented restrictions on 'inferred' (model-generated) memories: they can be procedural-tier, uncapped-confidence, and pinned**

### `src/lib/memory.ts:212` — correctness
**supersedeMemory deactivates the old (possibly trusted, active) entry even when the replacement lands as an unapproved proposal — and rejecting the proposal leaves the old memory dead; the function also has zero callers**

### `src/lib/context.ts:75` — correctness
**selectRelevantMemories breaks out of the budget loop on the first over-budget memory, so a single long top-ranked memory empties the entire dynamic context block**

### `src/app/find/page.tsx:124` — honesty-rule
**Find page presents a dead runtime as 'accounts not connected', sending the user to reconnect Gmail/Slack instead of starting the sidecar**

### `src/app/settings/page.tsx:119` — error-handling
**Settings shows '✓ Saved — using Gemini' / flips the Claude-CLI toggle even when the runtime rejected or never received the credential**

### `src/app/inbox/page.tsx:335` — adhd-ux
**Inbox row hover hardcodes light-theme cream (#F5EEDF), making hovered rows near-unreadable in dark mode**

### `src/lib/connections.ts:50` — correctness
**Disconnecting the last connection resurrects it: an empty v2 map makes getConnections() fall back to the legacy v1 store, which is never cleared**

### `src/lib/watcher.ts:54` — correctness
**Watcher marks items seen before the nudge gate, so notifications blocked by the 90-min batch window / quiet hours are permanently dropped, never deferred**

### `src/lib/notify.ts:44` — adhd-ux
**"Not now" on the notifications offer is not remembered — the one-time prompt re-appears on every launch because declined and never-asked are the same stored value**

### `src/lib/storage.ts:116` — concurrency
**Hydration race: a write issued while backendLoadAll() is in flight is missing from the session cache, so the value visibly reverts until the next app restart**

### `src/app/find/page.tsx:83` — prompt-injection
**Untrusted email/Slack/web content is placed in the system prompt rather than a user turn on the Find and LeadStories flows**

### `sidecar/server.ts:443` — concurrency
**scheduledTriageRefresh bypasses the inflight dedup, so scheduled and endpoint-kicked refreshes of the same cache run concurrently — double model spend and the parallel Slack conversations.history burst the code explicitly avoids**

### `sidecar/notify.ts:93` — correctness
**Fired-notification ledger prunes at 3 days while Slack triage retains messages 4 days — an already-acked emergency re-fires on day 3-4**

### `sidecar/llm.ts:190` — security
**Claude CLI provider inherits every integration secret in its subprocess env while running untrusted email/Slack content with no tool restriction**

### `src/app/page.tsx:919` — adhd-ux
**Flash toasts (including "Draft failed: …") are invisible in dark theme: bg-ink resolves to the light dark-mode text colour under near-identical light text**

### `src/app/inbox/page.tsx:335` — adhd-ux
**Inbox row hover hardcodes light-cream background #F5EEDF, making the hovered row's text unreadable in dark theme**

### `sidecar/connectors.ts:1360` — correctness
**Briefing endpoint strips `end` and `allDay` from calendar events, so the Home timeline drops in-progress meetings 30 min after they start, never shows durations, and all-day events masquerade as timed "02:00" events**

### `src/app/inbox/page.tsx:392` — honesty-rule
**Inbox reading pane hardcodes the recipient line as "to me" for every message, including mail addressed to lists and the user's own messages in the Sent folder**

### `src/app/calendar/page.tsx:42` — honesty-rule
**Calendar "Protect focus" preview promises MARVIN will "decline tentative invites that clash" and "reshuffle flexible tasks" — capabilities that exist nowhere; "Decline…" enqueues a payload-less approval that can never execute**

### `sidecar/server.ts:647` — error-handling
**Doctor (/diagnostics) reports Slack as 'Working' when every workspace fails auth — the error is only consulted when connected is false, but getSlack returns connected:true whenever tokens exist**

### `sidecar/connectors.ts:310` — error-handling
**getInbox/searchEmail drop per-account errors whenever any other account returns messages — a single expired Gmail account is invisible everywhere, including the Doctor**

### `src/app/find/page.tsx:76` — architecture
**Comments across find/lookup/websearch claim 'the model never gets a tool', but every one of those turns goes through POST /chat, which always attaches the full tool registry — untrusted email/Slack/web content flows into tool-enabled turns**

### `src/components/home/BreakItDown.tsx:17` — adhd-ux
**BreakItDown.tsx is dead and OpenLoop.steps are write-only: Routines promises loops 'land on Home broken down and ready' but Home never renders steps and toggleLoopStep is unreachable**

### `sidecar/guard.ts:36` — correctness
**Three drifted implementations of the days-off rule: guard.ts reads an env var nothing ever sets, server.ts reads kv settings with a timezone-naive getDay(), the renderer uses timezone-aware weekdayInTimezone**


## LOW (28)

### `sidecar/connectors.ts:321` — concurrency
**Cache-version stamp is read AFTER the fetch, so a credential change during an in-flight getInbox/getSlack caches stale (old-cred) data as fresh**

### `sidecar/connectors.ts:981` — robustness
**markSlackRead constructs a WebClient without SLACK_WC_OPTS, reintroducing the unbounded rate-limit retry the file explicitly bans**

### `sidecar/server.ts:340` — correctness
**lastLearned resets to [] on every sidecar boot while the boot-time scheduler tick immediately re-triages, overwriting the persisted learned-corrections snapshot with an uncorrected one — contradicting the comment that overnight triage "applies the same corrections Rebaz curated"; GET /triage/* has the same effect on demand**

### `sidecar/deadline.ts:40` — correctness
**normalizeDeadline accepts dates in the past (back to 2020), so a hallucinated past deadline reaches the UI as a bogus overdue date despite the module's validation contract**

### `sidecar/brief.ts:46` — correctness
**buildBriefInput's BRIEF_ITEM_CAP slices the newest 8 act-items with no priority ordering, so the item with today's hard deadline can be silently dropped from the brief**

### `sidecar/static.ts:68` — robustness
**Static file streaming has no 'error' handler on the ReadStream — a read error after statSync crashes the whole sidecar via an uncaught exception**

### `sidecar/server.ts:818` — robustness
**All request bodies are buffered into memory unbounded before any size validation**

### `sidecar/static.ts:103` — test-gap
**The path-traversal guard in serveStatic has zero test coverage despite being subtle, load-bearing boundary logic**

### `sidecar/llm.ts:251` — security
**Gemini API key is sent as a URL query parameter, leaking it into proxies and request logs**

### `src/app/page.tsx:777` — honesty-rule
**Slack 'See full message' fetches the last 14 channel messages without the message ts — the pane can show content that doesn't include the message being expanded**

### `src/app/page.tsx:277` — error-handling
**toggleExpand permanently caches transient fetch failures — 'couldn't load the full message' can never be retried within the session**

### `src/app/page.tsx:268` — correctness
**Hydration mismatch: the greeting is prerendered with the build machine's clock in a static export**

### `src/app/page.tsx:92` — correctness
**DueChip computes day boundaries in the machine-local timezone, not the configured profile timezone used everywhere else**

### `src/components/briefing/BriefingCard.tsx:83` — correctness
**BriefingCard reads peekData() (localStorage) in a useState initializer during the first render — the exact hydration-mismatch pattern use-live-data.ts documents as forbidden**

### `src/lib/marvin-data.ts:104` — test-gap
**Zero test coverage on the renderer-side cache/persistence layer (marvin-data.ts) despite it carrying the SWR, invalidation and disconnect-privacy invariants**

### `src/lib/memory.ts:231` — dead-code
**recordAccess is dead code: retrieval never bumps access stats, so lastAccessedAt/accessCount are write-only fields and the WMR 'reward useful memories' mechanism never runs**

### `src/lib/memory.ts:253` — correctness
**runMemoryMaintenance archives PINNED episodic memories, violating the pinned contract ('always injected, skip retrieval ranking & decay')**

### `src/lib/memory.ts:149` — test-gap
**Zero test coverage on the renderer memory/learning layer — including the write-gate that the architecture designates as the memory-poisoning control plane**

### `src/app/inbox/page.tsx:342` — correctness
**Star state ignores the server: in the Starred folder every message renders unstarred, and the first click on a starred message re-stars it instead of unstarring**

### `src/app/inbox/page.tsx:424` — correctness
**'Open the full email in Gmail' always links to account index /u/0, which is wrong for four of the five configured accounts**

### `src/lib/automations.ts:179` — dead-code
**weeklyEstimate() is dead code that fabricates run counts**

### `src/lib/storage.ts:112` — test-gap
**Zero test coverage on the renderer's load-bearing sync logic (dirty-ledger merge, nudge gating, settings override diff/merge, approvals prune)**

### `sidecar/connectors.ts:321` — concurrency
**getInbox stamps the current inboxCacheVer AFTER the fetch and has no inflight dedup — a credential change mid-fetch caches stale-cred data as fresh, and concurrent callers each run the full Gmail fan-out**

### `src/lib/storage.ts:271` — concurrency
**Renderer writeJson fire-and-forget /kv/set calls can apply out of order on the sidecar, leaving the server holding an older value with no dirty mark — the next hydrate silently rolls the key back**

### `src/lib/marvin-data.ts:114` — correctness
**marvin-data caches and persists a 200-but-errored payload (connected:true, messages:[], error) over the last-good localStorage snapshot, defeating the instant-relaunch paint**

### `src/app/page.tsx:584` — adhd-ux
**"Let it go" on a waiting-for-reply thread is session-only state, so dismissed threads resurface on every app launch**

### `sidecar/connectors.ts:584` — correctness
**getWritingSamples (Slack) inspects only the first configured workspace for a user token, wrongly reporting 'needs a USER token' when another workspace has one**

### `src/components/briefing/BriefingCard.tsx:1` — dead-code
**Three fully dead components — BriefingCard.tsx, ui/DataView.tsx, home/Orb.tsx — plus the unused apiTools() export; CLAUDE.md still documents DataView as the live binding for the integration screens**


---
_Total unique findings after dedupe: 97 (from 98 raw across 16 reviewers)._
