# Xanî — Architecture Review (ultracode pass, June 2026)

A four-stream review (memory/learning architectures, productivity-tool
architecture & UX, Claude agent-runtime best practices, and a deep code review)
plus targeted security/poisoning research. This records the decisions taken and
why, what changed in code, and what is deliberately deferred.

## Decisions taken

### Runtime & security (was the central contradiction)
- **Backend = Tauri Rust + a Node sidecar** running the raw Messages API with a
  manual tool loop. Not the Agent SDK (no durable state; CLI approval model fights
  a desktop UI). Not Next API routes — `output:'export'` has no server.
- **Secrets in the OS keychain** (`tauri-plugin-keyring`), passed to the sidecar
  via env. Renderer never sees a key. Stronghold is deprecated → rejected.
  → Code: split model constants into `src/lib/models.ts` (SDK-free) so the SDK
  never enters the renderer bundle; `anthropic.ts` is now sidecar-only with a
  browser guard.
- **Confirmation enforced at the runtime**, not the prompt: `src/lib/actions/guard.ts`
  classifies every tool call read/write, blocks writes to read/monitor-only
  scopes (LeadStories), and blocks initiating actions on days off.

### Memory & learning (scaled for a single user)
- **No vector DB.** Contrarian-but-supported finding: at single-user scale a
  simple typed store beats embedding overhead (a plain-filesystem memory scored
  74% on LoCoMo, beating vector libs). Revisit only if the corpus explodes.
- **Three tiers** (Letta/LangMem): procedural / semantic / episodic.
- **Mem0 write semantics** (ADD/UPDATE/DELETE/NOOP) with **soft-supersede**
  (Zep bitemporal-lite) instead of deletion — auditable history.
- **WMR retrieval** (recency + importance + relevance) and a **two-block,
  cache-friendly** system composition (stable cached block + small uncached
  relevant block) → ~$8/month with prompt caching.
- **The write path is the control plane.** Memory poisoning is OWASP's #2
  agentic risk for 2026 (AgentPoison, MINJA, "Zombie Agents"). External content
  never auto-persists or auto-pins; it becomes a low-trust **proposal** the user
  approves. Self-modification stays human-in-the-loop with locked rules, an audit
  trail, and a pending-proposal cap (Cursor Memories / BerriAI propose→approve).

### UX
- **⌘K command palette** (cmdk) — the keyboard-first spine every fast tool
  (Linear/Raycast/Superhuman/Shortwave) converges on.
- **Editorial briefing** (grouped, scannable < 90s) + time-aware greeting.

## What changed in this pass
- `models.ts` (new), `anthropic.ts` made sidecar-only — secret-leak path closed.
- `storage.ts` (new) — storage adapter seam (localStorage now → SQLite later).
- `settings.ts` — true override-layer persistence (no drift), locale-robust
  day-off (numeric, not English-string), `LOCKED_RULES`.
- `memory.ts` — tiers, trust/provenance, importance, status + proposal queue,
  `ingestMemory` write-gate, soft-supersede, enriched self-adjustment audit.
- `context.ts` — WMR scoring, two-block cache-friendly composer, Studio pinning
  fix, token-ish budget.
- `actions/guard.ts` (new) — the outward-action chokepoint.
- UI: command palette, editorial briefing, honest MarvinInput state, a11y
  (aria-pressed/labels), per-prompt reset on /settings, memory proposal review.
- Tauri: restrictive CSP, `capabilities/default.json`, generated icon set.
- Tooling: ESLint (next/core-web-vitals), stricter tsconfig
  (noUncheckedIndexedAccess, noUnused*). `tsc`, build, and lint are clean.

## Deliberately deferred (documented, not half-built)
- The live agent runtime (Node sidecar + tool loop + approval IPC + structured
  `propose_memory`/`propose_adjustment` tools + prompt caching). Phase 3.
- Rust SQLite (rusqlite + sqlite-vec) persistence; flip `storage.ts` to async
  Tauri commands. Phase 4.
- Real OAuth/keychain wiring for the connectors; live Studios. Phase 5.

## Key sources
Memory: mem0 (arXiv 2504.19413), Letta/MemGPT, Zep/Graphiti (arXiv 2501.13956),
LangMem, Anthropic prompt caching. Security: OWASP AI Agent Security Cheat Sheet
(ASI06), AgentPoison (arXiv 2407.12784), MINJA (arXiv 2503.03704), LlamaFirewall
(arXiv 2505.03574). Runtime: Anthropic tool-use / MCP connector / models &
pricing docs; multi-agent research system. UX/Tauri: Superhuman/Shortwave/Raycast/
Linear/Sunsama; Tauri v2 security, sidecar, sql, keyring docs.
