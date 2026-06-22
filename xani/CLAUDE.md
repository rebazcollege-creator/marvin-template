# Xanî — Claude Code Session Context

## Project
Personal AI OS for Rebaz (journalist, Berlin). Tauri + Next.js + Claude API.
Repo: xani | Branch: main | Timezone: Europe/Berlin

## Architecture decisions (settled — do not revisit)
- Tauri over Electron
- Zapier MCP for Trello (board 683dafe308be04e369b8434c)
- Direct MCP for Slack (channels C0HRYE891, C052Z75EY73) and Buffer
- Haiku for routine, Sonnet for Studios — target under $10/month
- Supervisor/sub-agent pattern from kaymen99/personal-ai-assistant
- Fresh repo, /reference for old code (gitignored)
- 5 Gmail accounts, each with independent OAuth
- 2 Slack workspaces (Amargi + LeadStories)

## Hard constraints
- TCS: no API, no automation — manual only
- LeadStories systems: read/alert only — no automated writes
- Moonshot systems: no automated writes to official spreadsheets
- Days off: Sunday + Tuesday — MARVIN does not initiate anything

## Integration status
- Trello: Zapier MCP ✓
- Slack Amargi: Direct MCP ✓ (C0HRYE891, C052Z75EY73)
- Buffer: Direct MCP ✓ (org 68d1dabf16b86596e286a44b, 7 channels)
- Gmail x5: pending OAuth
- Google Calendar: pending OAuth
- Slack LeadStories: pending OAuth
- Notion: pending

## Build phases
[x] Phase 1 — Scaffold + design system
[x] Phase 2 — MARVIN homepage + morning briefing (shell)
[x] Phase 1.5 — Customization (Settings) + memory/learning layer (shell)
[ ] Phase 3 — Studios (Amargi, LeadStories, Moonshot)
[ ] Phase 4 — Gmail + Calendar OAuth
[ ] Phase 5 — LeadStories Slack + Moonshot shadow log
[ ] Phase 6 — Voice layer (Whisper STT)
[ ] Phase 7 — Tauri packaging

## Reference parts library (/reference — gitignored, read-only)
- personal-ai-assistant — supervisor + sub-agent pattern (maps to MARVIN + Studios)
- ai-voice-assistant — Gmail/Calendar/web-search/STT pipeline
- khoj — scheduled automation, document ingestion, agent framework
- tauri — official scaffold + examples
NEVER import from /reference directly. Adapt patterns, do not reinvent.

## Customization layer (single-user app — settled)
Xanî is built for one user (Rebaz). Everything the brief hardcoded is editable
from the Settings page (/settings) and persisted as an override layer:
- Profile (name, timezone)
- Days off (weekday toggles — drives the briefing skip logic)
- MARVIN system prompt + every Studio prompt
- Model routing (routine / studio model ids)
Source of truth:
- src/prompts/* and src/lib/anthropic.ts hold the FACTORY DEFAULTS.
- src/lib/settings.ts merges user overrides (localStorage today; swap to Tauri
  fs config.json later) over those defaults via getSettings().
- Runtime consumers (briefing, Studios, API routes) MUST read getSettings(),
  never import the prompt constants directly, so user edits take effect.

## Memory & learning layer (single-user app — settled)
MARVIN learns from conversation and carries knowledge across sessions.
- src/lib/memory.ts is the "memory place":
  - MemoryEntry: durable distilled knowledge (preference/fact/workflow/correction).
    MARVIN extracts these from conversation (source: 'inferred'/'conversation');
    the user curates them on /memory (pin, edit, forget, add manually).
  - SelfAdjustment: MARVIN reasoning about its OWN behaviour and proposing a
    change to how it functions (e.g. edit a Studio prompt, change days off).
    Proposals are never auto-applied — the user approves/rejects on /memory.
    This is how MARVIN "updates itself" while still obeying the user.
- src/lib/context.ts composes the effective prompt at request time:
  base prompt (from Settings) + pinned/high-confidence memories. Studios also
  pick up learned preferences + corrections. THIS is what makes memory matter —
  runtime must call composeMarvinSystemPrompt()/composeStudioSystemPrompt(),
  not the raw prompt constants.
- The learning loop (to wire in Phase 2/3 with the agent runtime):
  converse → MARVIN proposes memories/adjustments → user curates/approves →
  context composer injects them next turn. Approved adjustments that target a
  prompt should be written back into Settings overrides.
- Persistence today: localStorage. Swap to Tauri fs/SQLite later; callers use
  the exported functions only.
- Guidance vs. obedience: MARVIN may propose and advise freely, but any change
  to its own functioning, or any outward action, requires explicit approval.

## Build rule
Do not mock data anywhere. Empty states only — never fake content.
