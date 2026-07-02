# Xanî — Principal-Level Audit (Fable 5)

*Date: 2026-07-02 · Scope: `xani/` only · Method: full read of the fragile core (sidecar, Home, data/memory/settings layer, Tauri shell) + targeted pass over the rest. Analysis only; no source files were modified.*

---

## 1. Executive Summary

**Overall health: B−.** For a solo-built early-stage desktop prototype this is an unusually disciplined codebase: strict TypeScript on both sides, a genuinely well-designed memory write-gate, honest empty states, a tight Tauri CSP, and real thought about prompt injection. The grade is dragged down by three things, not by general sloppiness. **Top 3 risks:** (1) the sidecar — the process holding every secret and the ability to send email as Rebaz — is an unauthenticated HTTP server with `Access-Control-Allow-Origin: *` bound on all interfaces, so any webpage in any browser on the machine (or any LAN device) can read his mail and trigger `/act` sends; (2) the app's core promise is silently broken: most "Approve/Send" buttons in Approvals are no-ops because no payload is ever attached, while the UI tells the user it sent; (3) the documented safety architecture (guard.ts as the enforcement chokepoint, day-off and read-only-scope rules) is dead code — the docs describe controls the runtime does not have. **Top 3 opportunities:** (1) a half-day of sidecar hardening (loopback bind + shared token + server-side guard) removes the entire critical risk class; (2) wiring the already-live connectors into the chat agent's stubbed tools would deliver the actual "AI OS" promise with mostly-existing code; (3) a single CI job plus ~10 tests around the triage/batch-parsing/settings-merge paths would protect exactly the code that has historically broken.

---

## 2. Repo Map

**Purpose.** Xanî is a single-user personal "AI OS" desktop app for one journalist (Rebaz, Berlin): triages 5 Gmail accounts and 2 Slack workspaces into "needs you / good to know / noise", tracks commitments ("open loops", ADHD working-memory support), drafts replies in his voice, and gates every outward action behind explicit approval.

**Stack & architecture.**

```
┌────────────────────────────── Tauri (Rust, src-tauri/) ─────────────────────┐
│  keychain.rs  → OS keychain (API key + integration creds)                   │
│  db.rs        → SQLite kv store (renderer persistence via invoke)           │
│  lib.rs       → spawns the sidecar binary with creds as env; tray; window   │
└──────────────┬───────────────────────────────────────────────┬──────────────┘
               │ Tauri IPC (kv_*, keychain commands)           │ spawn + env
┌──────────────▼──────────────┐   HTTP :8787 (SSE for /chat)  ┌▼─────────────────────────┐
│ Renderer (Next.js 15 static │◄─────────────────────────────►│ Node sidecar (sidecar/)  │
│ export, React 19, src/)     │                               │ owns ALL secrets; Gmail/ │
│ pages + lib/ stores         │                               │ Slack/Trello/Buffer/     │
│ (settings, memory, loops,   │                               │ Calendar REST + Anthropic│
│ approvals — localStorage/   │                               │ SDK tool loop (agent.ts) │
│ SQLite via storage adapter) │                               └──────────────────────────┘
└─────────────────────────────┘
```

**Key directories** (~13.2k LOC of TS/TSX/Rust; 20 routed pages):

| Path | One line |
|---|---|
| `sidecar/` | The trust boundary: HTTP server (`server.ts`, 591 ln), connectors (`connectors.ts`, 957 ln), agent tool loop (`agent.ts`), tool registry (`tools.ts`), dev cred store (`creds.ts`), loopback OAuth (`google-oauth.ts`), Bun-compile script |
| `src/app/` | Pages: Home (triage + open loops), inbox, slack, calendar, trello, buffer, approvals, memory, settings, train, 5 studios, etc. |
| `src/lib/` | Client stores & sidecar transport: `marvin-client.ts`/`marvin-data.ts` (HTTP), `memory.ts`/`context.ts` (memory + prompt composition), `settings.ts` (override layer), `open-loops.ts`, `approvals.ts`, `voice.ts`, `storage.ts` (localStorage↔SQLite seam) |
| `src/prompts/` | Factory-default persona prompts (renderer-safe, SDK-free) |
| `src-tauri/` | Rust shell: keychain, SQLite kv, sidecar spawn, tray, CSP/capabilities |
| `docs/` | 7 design docs + `CLAUDE.md` + `RUNTIME.md` (rich, but drifting — see D1) |

**Surprises found during discovery:**
- The audit brief mentions `sidecar/llm.ts` (Claude CLI spawn / provider resolution). **No such file exists** and nothing spawns a Claude CLI; the only LLM provider is `@anthropic-ai/sdk` with `ANTHROPIC_API_KEY` (`server.ts:44,69`). Either that feature was planned/reverted or the brief describes a different branch. Flagged in Open Questions.
- `src/lib/actions/guard.ts` — the documented action-enforcement chokepoint — is imported by **nothing** (verified by grep).
- Six renderer stub modules (`src/lib/gmail.ts`, `slack.ts`, `trello.ts`, `buffer.ts`, `calendar.ts`, `notion.ts`) plus `src/lib/anthropic.ts` are dead code — no imports anywhere in `src/`.
- Tests exist (5, good ones) but only for `agent.ts`; the historically fragile code (Slack triage, Gmail multi-account/batch parsing) has zero.

**Light-pass areas** (read partially or not judged in depth): studio components (`StudioWorkbench`, `DrafterWorkbench`, `LeadStoriesStudio`), `DataView`/UI components, `slack-mrkdwn.tsx`, `connect-flows.ts`/connections page, automations/notetaker/train page internals, prompt *content* in `src/prompts/`, Rust `Cargo.lock` dependency tree. Findings below are weighted toward the fragile ~20% as instructed.

---

## 3. Audit Report

Severity ordering within each dimension. Every FACT was verified in the file cited.

### 3.1 Security

**S1 — The sidecar is an open door to all secrets and outward actions. [CRITICAL · FACT]**
- WHERE: `sidecar/server.ts:243` (`Access-Control-Allow-Origin: *`), `server.ts:588` (`server.listen(PORT)` — no host argument, binds all interfaces), and no authentication on any route.
- WHY: The sidecar holds the Gmail refresh tokens, Slack tokens and Anthropic key, and exposes: read-everything (`/data/inbox`, `/data/message`, `/data/slack/history`), **send-as-Rebaz** (`POST /act` → `executeAction`, `server.ts:422-431`), credential overwrite/wipe (`POST /creds`, `/creds/clear`, `server.ts:371-390`), OAuth initiation, and paid LLM calls (`/draft-reply`, `/triage/*`). Because CORS is `*`, **any webpage open in any browser on the machine can read the responses**, not just fire blind requests: a drive-by page can exfiltrate email bodies and post to Slack as Rebaz. Binding all interfaces additionally exposes this to the LAN (co-working space, hotel Wi-Fi). No Host-header check means DNS rebinding works even if CORS were tightened. For a single-user app this is *the* threat model that matters — it's the user's own mail and identity.
- Also relevant: the CSP in `tauri.conf.json:24` correctly allows the webview to reach `localhost:8787`, so an auth token can be carried in a header without CSP changes.

**S2 — Approval is enforced only in the UI; the server executes anything. [HIGH · FACT]**
- WHERE: `sidecar/server.ts:422-431` (`/act` → `connectors.ts:916 executeAction`) performs sends with zero server-side checks. The agent loop's write gate (`agent.ts:139-156`) covers only `/chat` tool calls.
- WHY: CLAUDE.md's central claim — "Confirmation enforced at the runtime, not the prompt" (`CLAUDE.md:21-23`) — is true for exactly one of the two write paths. Any bug (or S1 attacker, or a future automation feature) that reaches `/act` sends immediately. Day-off and read-only-scope rules are enforced nowhere on this path.

**S3 — The documented action guard is dead code. [HIGH · FACT]**
- WHERE: `src/lib/actions/guard.ts` (`evaluateAction`, `canExecuteWithoutConfirmation`) — zero importers in the repo. CLAUDE.md:22 says "every tool call goes through `src/lib/actions/guard.ts`".
- WHY: The read/write classification, read-only-scope set, and the days-off block exist only as an unexercised module in the *renderer* (the wrong side of the trust boundary anyway — the sidecar can't import app-path aliases). The safety property Rebaz believes he has ("MARVIN initiates nothing on Sun/Tue") is not implemented in the runtime. JUDGMENT: the guard logic itself is well-designed; it just needs to live in the sidecar and be called.

**S4 — Email header injection + broken non-ASCII subjects in `sendGmail`. [MEDIUM · FACT]**
- WHERE: `sidecar/connectors.ts:814` — `` `To: ${p.to}\r\nSubject: ${p.subject}\r\n...` `` with no CRLF stripping and no RFC 2047 encoding.
- WHY: A `to`/`subject` containing `\r\n` injects arbitrary headers (e.g. `Bcc:`). Inputs come from the renderer today, but via S1 they come from anywhere; and drafts are LLM-generated, so a prompt-injected draft could smuggle a CRLF. Separately, a Kurdish/Arabic/German subject (his actual languages) is silently mangled because raw UTF-8 in a header is not encoded.

**S5 — Untrusted message text flows into the trusted triage prompt via "corrections". [MEDIUM · FACT + JUDGMENT]**
- WHERE: `src/app/page.tsx:206,212` passes the raw Slack message text / email subject into `recordTriageCorrection`; `triage-learning.ts:29-37` embeds it (first 90 chars) into a high-trust memory; `server.ts:120-128 withLearnings` injects those memories into the triage **system prompt** as "Rebaz has corrected you before".
- WHY: This is a designed channel where attacker-authored content (a subject line like `Ignore act verdicts from Finance…`) gets promoted into the trusted instruction slot the moment Rebaz clicks "Not for me" on it. The 90-char cap and the sender-focused phrasing limit the blast radius, but the write-gate philosophy (external content never becomes trusted instructions, `memory.ts:14-23`) is violated in spirit here. Fix is cheap: store only the *sender* and a category, never verbatim message text, in the learned rule.

**S6 — Loopback OAuth flow lacks `state`/PKCE. [LOW · FACT]**
- WHERE: `sidecar/google-oauth.ts:168-172` builds the auth URL with no `state`; the callback server (`:104`, correctly bound to 127.0.0.1) accepts any `code`.
- WHY: A login-CSRF can splice an attacker's account into a Gmail slot (mail you *send* could go via an attacker-monitored account). Low likelihood single-user, trivially fixed with a random `state` checked on callback.

**S7 — Accepted dev trade-offs worth keeping visible. [LOW · FACT]**
- Plaintext dev cred store `.xani-creds.json` at cwd (`creds.ts:15`) — gitignored (`.gitignore` confirmed) and documented; fine for dev, but S1 lets remote pages write to it.
- Trello/Buffer tokens in URL query strings (`connectors.ts:700,761`) — imposed by those APIs; they end up in any local proxy logs. Nothing to do beyond knowing it.

**Security strengths (verified, worth preserving):**
- **Renderer secret hygiene holds.** The only `NEXT_PUBLIC_` var is the sidecar URL (`marvin-client.ts:21`, `marvin-data.ts:26`); `credStatus` returns booleans only (`creds.ts:94-98`); keychain commands are write/check-only, no read-back to the renderer (`keychain.rs:20-85`); `src/lib/anthropic.ts` even throws if imported in a window context (`anthropic.ts:21-25`) — and is itself never imported by renderer code.
- **Tauri hardening is real:** tight CSP (`script-src 'self'`, `connect-src` limited to IPC + `localhost:8787`, `tauri.conf.json:24`), minimal capabilities (`capabilities/default.json` — `core:default` only).
- **Email HTML is rendered in a sandboxed iframe without `allow-scripts`** plus belt-and-braces sanitization (`EmailBody.tsx:14-19,63`).
- **Prompt-injection discipline is above average:** triage output is a constrained JSON contract matched back by ID with safe fallbacks (`server.ts:196-205,229-235`); draft/summarize prompts explicitly frame content as untrusted data (`server.ts:493,498,538`); the extraction prompt forbids extracting from quoted external content (`server.ts:83-88`); the memory write-gate forces external/inferred content to proposed-low-trust-never-procedural (`memory.ts:149-180`).

### 3.2 Correctness (Architecture & design overlap)

**C1 — Most Approvals are silent no-ops; the flagship flow never sends. [HIGH · FACT]**
- WHERE: `approvals/page.tsx:52-57` — `approve()` with no `payload` just marks the item approved and reports success. Payload-less enqueues: Home draft-reply for email and Slack (`page.tsx:230,241`), calendar decline (`calendar/page.tsx:51-57`), Trello move (`trello/page.tsx:47-53`), Notetaker routing (`notetaker/page.tsx:208-214`), automations "Run now" (`automations/page.tsx:135-141`). Only Compose, Slack composer, Trello create, Buffer post and inbox→card carry payloads.
- WHY: The Home flow — the product's centerpiece — says "✍️ Draft ready in Approvals — review & send" (`page.tsx:231`), the button says "Send", the confirm modal says it "runs through MARVIN's runtime" (`approvals/page.tsx:218`), and then *nothing is sent*. For email replies it *cannot* send: the loop captures `from` as a display string but never the reply-to address, and `sendGmail` needs `to` (`connectors.ts:814`); no `In-Reply-To`/`threadId` is ever set either, so even a wired-up "reply" would arrive as a fresh unthreaded email. For an app whose one job is "you can trust me to hold and finish loops", telling the user a reply was sent when it wasn't is the most damaging bug in the codebase.

**C2 — "Approved while offline" items are marked approved and never run. [HIGH · FACT]**
- WHERE: `approvals/page.tsx:63-66` — on `offline`, the item is decided `approved` with "It will run once the runtime is on". No queue, no retry, nothing scans approved-but-unexecuted items when the sidecar returns. `RUNTIME.md` §1 explicitly claims "they don't silently fail" — they do.

**C3 — The chat agent's tools are stubs while the same data is live one file away. [MEDIUM · FACT]**
- WHERE: `sidecar/tools.ts:33-75` — all five read tools return `"...is not connected yet."` via `notConnected()`, while `connectors.ts` serves real Gmail/Calendar/Slack/Trello/Buffer data to `/data/*`.
- WHY: Ask MARVIN "what needs me today?" and it truthfully reports Gmail isn't connected while the Home page behind it displays the live inbox. This makes the assistant look broken and unreliable — the exact trust failure the product exists to avoid. It's also the single highest-leverage feature gap: the connectors exist; the tools just don't call them.

**C4 — Connector failures masquerade as empty success. [MEDIUM · FACT]**
- WHERE: `getCalendar` catch → `{connected:true, events:[]}` (`connectors.ts:448-450`, non-OK at `:437`); same pattern in `getDrive` (`:480,492-494`), `getTrello` (`:724,750-752`), `getBuffer` (`:762,773-775`), `getGithub` (`:787,796-798`); `gmailUnreadCounts` silently drops failing accounts (`:74-84`).
- WHY: "No events today" and "Google returned 500" render identically. For an ADHD-support tool, a calendar that silently shows empty on a token failure is worse than one that's down — the user plans around a lie. Gmail's `getInbox` does this right (per-account `errs[]` surfaced, `:229-276`); the pattern just wasn't applied to the other five.

**C5 — Home's clock is frozen at mount. [MEDIUM · FACT]**
- WHERE: `src/app/page.tsx:109` — `const now = useMemo(() => new Date(), [])`; used for the next-event countdown (`:157-164`), greeting, due/overdue labels, and even snooze arithmetic.
- WHY: This is a resident tray app (`lib.rs:21-48`); the window sits open for hours. "Standup in 45 min" still reads 45 min at meeting time. The feature exists specifically to counter time-blindness (`page.tsx:18-21`) and does the opposite after the first minute. A 30s interval tick fixes it.

**C6 — Keychain key list drifted from the dev cred list: packaged app loses Slack features. [LOW→MEDIUM · FACT]**
- WHERE: `src-tauri/src/keychain.rs:33-62` lacks `SLACK_AMARGI_USER_TOKEN`, `SLACK_LEADSTORIES_BOT_TOKEN`, `SLACK_LEADSTORIES_USER_TOKEN` (all present in `sidecar/creds.ts:17-49` and used by `connectors.ts:504-513`).
- WHY: In the packaged app these can't be stored or injected at sidecar spawn (`lib.rs:70-72`), so LeadStories Slack and all user-token features (real unread state, DMs — the core of Slack triage per `connectors.ts:552-556`) silently vanish in exactly the build that matters. Classic two-lists-no-single-source bug.

**C7 — `spawnSync` transcription blocks the whole sidecar. [LOW · FACT]**
- WHERE: `server.ts:408`. While whisper runs (tens of seconds for a long note), every endpoint — chat streams, triage, approvals — is frozen, because this is the single event loop that owns everything.

**C8 — Agent loop can end with dangling `tool_use` and no notice. [LOW · FACT]**
- WHERE: `agent.ts:76,96-109` — after `MAX_ITERATIONS` (8), the loop exits emitting `done` even if the last message requested tools; the persisted conversation then has a `tool_use` with no `tool_result`, which the Anthropic API rejects on the next turn of that chat.

### 3.3 Code quality

**Q1 — ~400 lines of dead code, including the safety module. [MEDIUM · FACT]**
- WHERE: `src/lib/gmail.ts`, `slack.ts`, `trello.ts`, `buffer.ts`, `calendar.ts`, `notion.ts`, `anthropic.ts`, `actions/guard.ts` — zero importers (grep-verified). `connections.ts` is used; these siblings are pre-sidecar leftovers.
- WHY: Beyond noise, it's actively misleading: two of these (guard, anthropic) *look like* load-bearing security architecture. Anyone (including future-Claude sessions) reading `src/lib/` will misjudge where enforcement lives.

**Q2 — Duplicated draft-reply client, the worse one still in use. [LOW · FACT]**
- WHERE: `marvin-data.ts:174-187 draftReply` (collapses all failures to `null`) vs `marvin-client.ts:268-289 requestDraft` (surfaces the real error, written explicitly to replace it per its own comment at `:242-244`). Inbox and Slack pages still call the null-swallowing one (`inbox/page.tsx:159`, `slack/page.tsx:109`), so a billing/key failure there shows as a generic failure instead of the actual reason.

**Q3 — The hand-rolled Gmail batch multipart parser is clever, load-bearing, and untested. [LOW · FACT/JUDGMENT]**
- WHERE: `connectors.ts:141-181` — manual multipart assembly and a first-`{`/last-`}` JSON scrape per part. It has a graceful fallback (`:250-261`), which is good, but a Google format quirk silently degrades every cold inbox load to 30 sequential-ish fetches per account with no signal. This is exactly the kind of code the "Gmail has been fragile" history points at; it needs a fixture test (see T-M0.2).

**Type safety: healthy.** [FACT] Strict + `noUncheckedIndexedAccess` in both tsconfigs; three narrow `as unknown as` casts in the whole repo (`agent.ts:129,134`, `server.ts:80`), each at a genuine SDK boundary. No `any` found in `src/` or `sidecar/`.

**God-file check: acceptable.** [JUDGMENT] `connectors.ts` (957 ln) is five well-sectioned integrations plus writers; splitting it now would be motion, not progress. Revisit only if per-integration caching/state grows.

### 3.4 Testing

**T1 — The fragile core has no tests at all. [HIGH · FACT]**
- WHERE: `sidecar/agent.test.ts` is the entire test suite: 5 good, dependency-injected tests of the tool loop (approve/reject/proposal/read paths).
- WHY: Zero coverage on the code that the project's own history says breaks: triage JSON parsing + verdict fallbacks (`server.ts:195-205`), the Slack candidate filter (self-message exclusion, DM/mention/emergency rules, `server.ts:165-183`), `gmailBatchGetMetadata` (Q3), inbox cursor/pagination merge (`connectors.ts:218-262`), settings override merge (`settings.ts:88-131`), the memory write-gate invariants (`memory.ts:149-184`), and `activeLoops` ordering/snooze (`open-loops.ts:62-73`). All of these are pure or injectable — cheap to test; nothing needs a network.

**T2 — No CI, and the sidecar is invisible to every quality gate. [MEDIUM · FACT]**
- WHERE: no `.github/` directory; `.eslintrc.json` ignores `sidecar/` and `src-tauri/`; root `tsconfig.json` excludes `sidecar`; `sidecar/tsconfig.json` exists but **no script runs it** — the sidecar executes via Node type-stripping (`sidecar/package.json` comment), which ignores type errors entirely.
- WHY: A type-broken sidecar passes `npm run lint`, `npm run build`, and runs until the broken line executes. The most security-critical code in the repo is the only code with no lint and no typecheck anywhere in the toolchain.

### 3.5 Performance

**P1 — Inbox triage re-runs a Haiku call on every Home visit; Slack triage is cached but inbox is not. [MEDIUM · FACT]**
- WHERE: `triageSlack` has a 90s cache (`server.ts:130-138`); `triageInbox` (`server.ts:212-240`) has none — each Home mount = 1 LLM call over up to 40 messages (the Gmail fetch itself is 25s-cached, `connectors.ts:127`). Cost is small in absolute terms but it's the app's most frequent screen; latency and spend are both pure waste, and the asymmetry looks like an oversight rather than a decision.

**P2 — `getSlack` fires up to ~60 `conversations.info` calls per workspace in one unbounded burst. [LOW · FACT]**
- WHERE: `connectors.ts:579-586` — `Promise.all` over every membered conversation, per workspace, on every sidebar/Home load (no cache on `getSlack` itself). A `mapPool` helper already exists in the same file (`:101-112`) and isn't used here. Rate-limit trips would surface as the exact "Slack unread flakiness" the history mentions.

**P3 — Unbounded stores: open loops and approvals never prune. [LOW · FACT]**
- WHERE: `open-loops.ts:105-115` (done loops kept forever), `approvals.ts` (decided items kept forever) — contrast the deliberate caps on chats (50, `chats.ts:19`) and activity (200, `activity.ts:29`). Years of daily use on a kv-JSON blob that is fully rewritten on every change (`storage.ts:92-96`) will get slow and bloated.

**P4 — Voice-sample training fetches sent mail for all five accounts then filters to one. [LOW · FACT]**
- WHERE: `connectors.ts:380-382` — `getInbox('sent')` hits every account; `p.account` filtering happens client-side after.

### 3.6 Dependencies

Healthy overall. [FACT] Seven runtime deps, all mainstream (`package.json:17-25`); lockfile committed; Rust side equally lean. Two notes: **`playwright` is a devDependency with no config, no test, no import** — either an aspiration or a leftover; and `@anthropic-ai/sdk ^0.32.1` is well behind current — fine today, but pin-and-upgrade deliberately before relying on newer API features (the manual `cache_control` mapping in `server.ts:57-67` is the kind of shim newer SDK versions obviate). Not run/verified: `npm audit` (installs prohibited for this audit).

### 3.7 DevEx & operations

Covered mostly by T2. Additional facts: `scripts/dev-all.mjs` is a genuinely nice zero-dep dual-process launcher; error surfacing to the UI is consistently good (`marvin-client.ts` returns honest offline/error states everywhere); the sidecar logs to stdout only — in the packaged app (`lib.rs:73-79` discards the spawn rx) sidecar stderr goes nowhere, so production failures are undiagnosable without a log file. [FACT, low]

### 3.8 Documentation

**D1 — CLAUDE.md/RUNTIME.md describe an app that differs from the code in safety-relevant ways. [MEDIUM · FACT]**
- CLAUDE.md:13-14 "renderer talks to it over Tauri IPC" — it's HTTP on 8787 (everywhere).
- CLAUDE.md:21-23 guard.ts enforcement — dead code (S3).
- CLAUDE.md:30-31 "Zapier MCP for Trello… Direct MCP for Slack (C0HRYE891…)" — code uses Trello REST (`connectors.ts:687-753`) and auto-discovered Slack channels (`connectors.ts:498-501`); no MCP anywhere in the sidecar.
- RUNTIME.md §1 offline-approval claim — false (C2).
- The audit brief's `sidecar/llm.ts` / Claude-CLI provider — nonexistent.
- WHY it matters more here than usual: CLAUDE.md is the standing context for every AI-assisted session on this repo; wrong claims get *built upon*.

Otherwise documentation is a strength: 7 real design docs, and inline comments that explain *why* (e.g. the Slack tier-3 rationale at `connectors.ts:547-556`) at a quality most teams don't reach.

### 3.9 Strengths (keep these)

1. **The trust-boundary design is right**: secrets in keychain → sidecar env → never the renderer; verified end to end (see Security strengths). The flaw is the sidecar's front door, not the architecture.
2. **Memory write-gate** (`memory.ts`) — provenance/trust/status with forced-proposal for untrusted sources — is a genuinely good scaled-down mem0/Zep adaptation, implemented as designed.
3. **Settings as a diff-over-defaults override layer** (`settings.ts:88-131`) — solves prompt-drift elegantly.
4. **Dependency-injected agent loop** (`agent.ts`) — testable without network, and actually tested.
5. **Honest UX discipline**: no mock data, real empty states, error strings that tell the user what to run — consistently applied (C1/C2/C4 are the exceptions that prove the rule).
6. **`storage.ts` cache-hydrate seam** — the localStorage→SQLite migration happened without an async ripple through 15 call sites, exactly as the design intended.
7. **Performance work where it counted**: Gmail batch endpoint (1 round-trip vs 30), 25s inbox TTL + version-busting on cred change, SWR client cache with in-flight dedupe (`marvin-data.ts`), Slack sidebar deliberately avoiding the rate-limited history API.

---

## 4. Improvement Strategy

### Theme 1 — Make the trust boundary real (close the sidecar's front door)
- **Target state:** the sidecar listens on `127.0.0.1` only, requires a shared secret on every request (generated at spawn; handed to Tauri via env → renderer via a Tauri command; dev: written to a gitignored file next to `.xani-creds.json`), and CORS is pinned to the app origins (`tauri://localhost`, `http://localhost:3000`). `/act` and chat write-tools run through one server-side guard (day-off, read-only scopes, kind classification) ported from `guard.ts` into `sidecar/`.
- **Principle:** enforcement lives on the same side of the boundary as the capability. A renderer-side guard protects against nothing the renderer can't already do.
- **Trade-offs / NOT doing:** no TLS on loopback, no user accounts, no per-route ACLs, no rate limiting beyond what fixes P2 — single-user localhost doesn't need them; the token + bind is sufficient and ~200 lines total.
- **Done signals:** `curl http://localhost:8787/data/inbox` from a terminal returns 401; a fetch from a random browser tab fails CORS *and* auth; `POST /act` on a configured day off returns a refusal with the day-off reason.

### Theme 2 — Never claim an action happened when it didn't (C1/C2/C4)
- **Target state:** an approval either carries an executable payload or the UI says plainly "preview only — sending isn't wired for this yet". Email replies capture the reply-to address and thread ID at triage/loop-capture time and actually send threaded replies. Approve-while-offline keeps items in a visible "approved — waiting for runtime" state that re-runs (still behind the same payload) when `/health` returns, or the claim is removed from UI copy and RUNTIME.md. Connectors return `connected:false`/`error` on failure instead of empty success.
- **Principle:** for this product, *false success is worse than failure*. The entire value proposition is "you can stop holding this in your head" — one discovered unsent reply destroys it.
- **Trade-offs / NOT doing:** don't build a durable job queue or scheduler; a "pending-run" status field plus a check on sidecar-reachable is enough at this scale.
- **Done signals:** every `enqueueApproval` call site either passes `payload` or `actionLabel` that doesn't imply sending; a manual test "draft reply → approve → check Gmail Sent" shows a threaded reply; killing the sidecar mid-flow leaves the item visibly pending, and restarting completes it.

### Theme 3 — Wire the assistant to the data it already has (C3)
- **Target state:** the five stub tools in `tools.ts` call the live connectors (through the Theme-1 guard), so MARVIN chat can answer "what needs me today?" from real Gmail/Slack/Trello/Calendar. This is the moment the app becomes what CLAUDE.md says it is.
- **Principle:** highest leverage per line — the hard parts (connectors, tool loop, approval flow, streaming) all exist; this is plumbing.
- **Trade-offs:** each tool result should be summarized/capped (ids + subjects, not full bodies) to control tokens; keep write tools out of this pass except the already-mocked propose_* pair.
- **Done signals:** chat answer to "what needs me today" cites actual inbox items; the "not connected yet" string no longer exists in `tools.ts` for connected integrations.

### Theme 4 — A safety net sized for one developer (T1/T2)
- **Target state:** one GitHub Actions workflow: `npm ci` → `eslint` (including `sidecar/`) → `tsc --noEmit` (root) → `tsc -p sidecar --noEmit` → `node --test sidecar/`. ~10 new tests around the historically fragile pure functions (triage parse, Slack candidate filter, batch parser fixture, settings merge, write-gate invariants, activeLoops ordering).
- **Principle:** protect the code that has actually broken, not coverage percentages. Everything listed is pure or DI-injectable — no network, no mocks of the world.
- **Trade-offs / NOT doing:** no Playwright e2e yet (remove the unused dep or leave it for a deliberate later decision); no Rust CI until `cargo build` works somewhere (CLAUDE.md notes the toolchain gap); no coverage thresholds.
- **Done signals:** CI red when a triage-parse regression is introduced; sidecar type error fails the build; `git log` shows the workflow running on pushes.

### Theme 5 — Truth in documentation, deletion of ghosts (Q1/D1)
- **Target state:** dead modules removed; CLAUDE.md corrected (HTTP not IPC, guard location, REST not MCP, current approval semantics); RUNTIME.md matches C2's real behavior; the two credential key lists get a single source (generate `keychain.rs`'s list or assert parity in a test).
- **Principle:** in an AI-assisted solo repo, CLAUDE.md *is* part of the codebase — wrong docs compound into wrong code.
- **Done signals:** grep for `evaluateAction` returns only sidecar usage; a parity test fails if `creds.ts` ALLOW and `keychain.rs` INTEGRATION_KEYS diverge.

**Explicitly out of scope (and would be wrong here):** multi-tenant auth, horizontal scaling, microservice split, vector DB for memory, message queues, heavyweight release process. The single-user local architecture is a correct decision; nothing in this audit argues against it.

---

## 5. Task Plan

### Milestones

**M0 — Safety net (do first; makes M1 safe to do)**

| ID | Task | Files | Acceptance criteria | Effort | Risk | Deps |
|---|---|---|---|---|---|---|
| M0.1 | Add `typecheck` scripts + CI workflow (lint, 2× tsc, node --test) | `package.json`, new `.github/workflows/ci.yml` | CI runs on push; a seeded sidecar type error fails it | S | none | — |
| M0.2 | Tests: extract & test triage verdict parsing; Slack candidate filter; `gmailBatchGetMetadata` with a captured multipart fixture; settings merge round-trip; `ingestMemory` gate invariants; `activeLoops` ordering | `sidecar/server.ts` (extract pure fns), `sidecar/connectors.ts` (export parser), new `*.test.ts` | Each listed behavior has ≥1 assertion-bearing test; all pass via `node --test` | M | low (pure extraction refactors) | M0.1 |
| M0.3 | Lint the sidecar (remove from `ignorePatterns`, fix fallout) | `.eslintrc.json`, sidecar files | `npm run lint` covers `sidecar/` and passes | S | none | — |

**M1 — Critical security & correctness**

| ID | Task | Files | Acceptance criteria | Effort | Risk | Deps |
|---|---|---|---|---|---|---|
| M1.1 | Sidecar auth: loopback bind + spawn-time token + pinned CORS (sketch A below) | `sidecar/server.ts`, `src-tauri/src/lib.rs`, `marvin-client.ts`, `marvin-data.ts`, `scripts/dev-all.mjs` | Unauthenticated requests → 401; app fully functional in dev + Tauri | L | medium (touches every fetch — mitigated by one shared helper) | M0 |
| M1.2 | Server-side action guard: port guard.ts logic into `sidecar/`, call it from `/act` and agent write path; delete renderer copy | new `sidecar/guard.ts`, `server.ts`, `connectors.ts`, remove `src/lib/actions/guard.ts` | Day-off `/act` refused; guard unit-tested; CLAUDE.md claim becomes true | M | low | M1.1 |
| M1.3 | Approvals send for real (sketch B): capture reply-to + threadId into loop/approval payloads; threaded `sendGmail` reply; Slack reply payloads; honest labels for the rest | `page.tsx`, `open-loops.ts`, `approvals.ts`, `approvals/page.tsx`, `connectors.ts`, `marvin-protocol.ts` | "Draft → approve" delivers a threaded reply; every payload-less item's button no longer says Send | L | medium | — |
| M1.4 | Sanitize/encode outgoing email headers (strip CR/LF; RFC 2047-encode subject) | `connectors.ts:803-827` | CRLF in to/subject cannot inject; UTF-8 subject arrives intact | S ⚡ | none | — |
| M1.5 | Honest connector errors: return `connected:false`/`error` on failure in calendar/drive/trello/buffer/github/unread-counts; surface in the relevant views | `connectors.ts`, minor page tweaks | Killing network shows "couldn't reach X", never a clean empty state | M | low | — |

**M2 — High-leverage improvements**

| ID | Task | Files | Acceptance criteria | Effort | Risk | Deps |
|---|---|---|---|---|---|---|
| M2.1 | Live agent tools: wire `tools.ts` executes to connectors (capped summaries), behind the M1.2 guard | `sidecar/tools.ts`, `connectors.ts` | Chat answers "what needs me today?" with real data | M | low | M1.2 |
| M2.2 | Cache inbox triage (mirror the 90s Slack pattern; key on inbox etag/first-id + learned set); dedupe the two triage functions' shared shell | `server.ts` | Two Home visits in 90s = one LLM call; behavior unchanged otherwise | S ⚡ | low | M0.2 |
| M2.3 | Ticking `now` on Home (30s interval state) | `page.tsx:109` | Countdown visibly updates without remount | S ⚡ | none | — |
| M2.4 | Credential key-list parity: add missing Slack keys to `keychain.rs` + a parity test against `creds.ts` ALLOW | `keychain.rs`, new test | Packaged app injects user tokens; test fails on future drift | S ⚡ | none | — |
| M2.5 | Offline-approval truth: add `pending-run` status + re-run on sidecar reachable, and fix RUNTIME.md; OR change copy to "recorded, won't auto-run" | `approvals.ts`, `approvals/page.tsx`, `RUNTIME.md` | No UI text promises execution that can't happen | M | low | M1.3 |
| M2.6 | Async transcription: `spawn` instead of `spawnSync` | `server.ts:392-420` | Chat streams while a transcription runs | S | none | — |

**M3 — Quality & polish**

| ID | Task | Files | Effort |
|---|---|---|---|
| M3.1 | Delete dead modules (`gmail/slack/trello/buffer/calendar/notion/anthropic.ts`; guard.ts goes in M1.2) | `src/lib/*` | S |
| M3.2 | Converge on `requestDraft`; delete `marvin-data.draftReply`; migrate inbox/slack pages | `marvin-data.ts`, `inbox/page.tsx`, `slack/page.tsx` | S |
| M3.3 | Prune stores: cap done loops + decided approvals (e.g. keep 200, or 90 days) | `open-loops.ts`, `approvals.ts` | S |
| M3.4 | `mapPool` the `conversations.info` burst (limit ~8) + short TTL cache on `getSlack` | `connectors.ts:579-586` | S |
| M3.5 | CLAUDE.md/RUNTIME.md accuracy pass (IPC→HTTP, guard location, REST vs MCP, approval semantics); drop or justify the `playwright` devDep | docs, `package.json` | S |
| M3.6 | OAuth `state` param + check | `google-oauth.ts` | S |
| M3.7 | Sidecar file logging in packaged app (pipe spawn rx to a log file in app-data dir) | `src-tauri/src/lib.rs` | S |
| M3.8 | Stop verbatim message text entering learned triage rules (sender + category only) | `triage-learning.ts`, `page.tsx` | S |
| M3.9 | Emit a visible notice on MAX_ITERATIONS exit; drop trailing dangling `tool_use` before persisting | `agent.ts`, `MarvinChat.tsx` | S |

**Quick wins (high impact, S effort — marked ⚡ above):** M1.4 header sanitization, M2.2 triage cache, M2.3 ticking clock, M2.4 keychain parity. All four are independent and could land in one afternoon.

### Top-3 implementation sketches

**A. Sidecar auth (M1.1).**
Approach: (1) `server.listen(PORT, '127.0.0.1')`. (2) Token: in `lib.rs::spawn_sidecar`, generate 32 random bytes hex, pass as `MARVIN_SIDECAR_TOKEN` env to the sidecar *and* `app.manage()` it; add a `get_sidecar_token` Tauri command for the renderer. Dev: sidecar generates the token if unset and writes `.xani-runtime.json` (gitignore it); the Next dev renderer fetches it — simplest is `next dev` reading it via a tiny `/token` exemption bound to… no: in dev just have `dev-all.mjs` generate the token and export it to both children (`MARVIN_SIDECAR_TOKEN` for the sidecar, `NEXT_PUBLIC_MARVIN_SIDECAR_TOKEN` for the UI — acceptable in dev only, and worth a code comment saying exactly why prod must not do this). (3) Enforcement: one middleware check at the top of the request handler — `req.headers['x-marvin-token'] === TOKEN` for everything except `/health`; CORS: reflect only `tauri://localhost` / `http://localhost:3000`, and set `Vary: Origin`. (4) Client: single `sidecarFetch(path, init)` helper in a new `src/lib/sidecar-fetch.ts`; migrate the ~15 fetch sites in `marvin-client.ts`/`marvin-data.ts` to it (mechanical). Gotchas: the OAuth loopback server on 8788 must stay tokenless (the browser redirect can't carry it) — it's already 127.0.0.1-bound and stores creds only through in-process `setCred`, fine; SSE requests can carry headers via `fetch` (already used — no EventSource, so no header limitation); Tauri renderer must fetch the token before the first data call — do it inside `ensureStorageReady()` or a parallel `ensureRuntimeReady()`.

**B. Approvals that actually send (M1.3).**
Approach: (1) Extend the email loop context (`open-loops.ts:46`) with `replyTo` and `threadId`; populate at triage time — the triage list already has `from` (parse the address out of the display string) but the reliable source is `getMessageBody`: extend it to also return `From`/`Reply-To`/`Message-ID`/`threadId` headers (it already fetches `format=full`; the headers are in `payload.headers`). Home's `draftLoopReply` (`page.tsx:220-244`) already calls `fetchMessageBody` before drafting — capture the headers there. (2) Add `ActPayload` email fields `threadId`/`inReplyTo`; in `sendGmail` (`connectors.ts:807-827`) add `In-Reply-To`/`References` headers and `threadId` in the JSON body (Gmail API supports `{raw, threadId}`). (3) Home enqueues the approval **with** `payload: {kind:'email', to: replyTo, subject: `Re: ${subject}`, body: draft, account, threadId, inReplyTo}`; Slack likewise `{kind:'slack', channel: loop.slack.channelId, text: draft, workspace}` — all fields already exist in the loop. (4) Edited previews must update the payload body: in `saveEdit` (`approvals/page.tsx:70-80`), also write `payload.body`/`payload.text` when present. (5) For the remaining payload-less enqueues (calendar decline, Trello move, notetaker, automations): change `actionLabel` to "Mark handled" or wire real payloads case by case — do *not* leave "Send"/"Move card" on no-ops. Gotchas: multi-recipient/Reply-All is a product decision — punt, reply to sender only and say so in the preview header; sanitize headers first (M1.4) since `replyTo` now comes from hostile mail.

**C. CI + fragile-core tests (M0).**
Approach: (1) Extract pure functions so they're importable without starting the server: `parseTriageVerdicts(text): Verdict[]` and `selectSlackCandidates(slackData, histories): Cand[]` out of `server.ts`; export `gmailBatchGetMetadata`'s body-parsing step as `parseBatchResponse(contentType, text)` from `connectors.ts`. These are move-only refactors; behavior identical. (2) Tests (node:test, same style as `agent.test.ts`): verdict parse — prose-wrapped JSON, malformed JSON → fallback verdicts (`dm→act`, email→`know`), unknown ids ignored; Slack candidates — self-messages excluded, non-mention channel messages excluded, dedupe by `channel:ts`; batch parser — a fixture string captured from a real Google batch response (quoted boundary, per-part JSON), plus a garbage-input → `null`-ish case; settings — `diffFromDefaults`+`mergeWithDefaults` round-trip and "new default reaches unedited field"; memory gate — `external` source ⇒ proposed/low/≤0.5/never-procedural/never-pinned; loops — due-before-created ordering, snoozed-until-past reappears. `readJson`/`writeJson` work without a browser only if guarded — memory/loops tests can inject via the existing localStorage fallback… simpler: run those in a tiny in-memory shim by testing the pure pieces (`ingestMemory` calls `writeJson` — so give `storage.ts` an injectable backend for tests, or set `globalThis.window` shim; the shim is 5 lines). (3) Workflow: single job, Node 22, `npm ci && npm run lint && npx tsc --noEmit && npx tsc -p sidecar --noEmit && npm run sidecar:test`. Gotchas: `sidecar/tsconfig.json` includes `../src/lib/marvin-protocol.ts` — `tsc -p sidecar` must run from repo root so the relative include resolves; Node's type-stripping quirks mean the test files should keep using explicit `.ts` import extensions like the existing test does.

---

## 6. Open Questions for Rebaz

1. **Where did `sidecar/llm.ts` / the Claude-CLI provider go?** The audit brief describes it; the code has only the API-key SDK path. If CLI-as-provider is still the plan, it changes M1.1's threat model (spawning a CLI from an HTTP-reachable process raises the stakes on auth) — settle direction before building it.
2. **Is `/act` supposed to honor days-off?** The UI approval *is* the human confirmation, and blocking a send Rebaz explicitly approves on a Tuesday may be wrong. M1.2 should distinguish "MARVIN-initiated" (blocked on days off) from "user-approved" (allowed). Needs a product call.
3. **Approve-while-offline: queue or honesty?** M2.5 offers both. A real pending-run queue is more work and slightly more failure surface; changing the copy is 10 minutes. Which matches how you actually use it?
4. **Email reply semantics:** reply-to-sender only, or Reply-All? And should MARVIN drafts ever include quoting of the original? Blocks the final shape of M1.3.
5. **Trello via REST vs Zapier MCP, Slack channel auto-discovery vs the pinned channel IDs in CLAUDE.md:** the code moved on from the settled decisions; confirm the code's direction is the new decision so the docs pass (M3.5) codifies rather than reverts it.
6. **Dead renderer stubs (`src/lib/gmail.ts` etc.):** deletion candidates in M3.1 — any of these intentionally kept as future scaffolding?
7. **What is "good enough" for packaged-app verification?** Several done-but-unverified items (Rust build, keychain, tray, sidecar binary) are flagged "verify on macOS" in CLAUDE.md. Until one `tauri build` succeeds on the real machine, findings like C6 stay theoretical — worth scheduling before more prod-path code lands.
8. **Playwright:** planned e2e testing, or remove the dependency?
