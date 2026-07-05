# Notifications — how Xanî decides to interrupt Rebaz

A notification is an interruption, and interruptions are the fastest way to make someone
with ADHD resent a tool. So Xanî has **two** notification paths, deliberately separated by
whether a window is open, and both hold a high bar.

## 1. App-open path (shipped) — `runWatch` + `src/lib/notify.ts`

Runs in the renderer (`components/system/Watcher.tsx`), polling every 60s while a window is
open. Uses only **non-model** signals (Slack emergency / DM-unread / names "Rebaz"; Gmail's
own IMPORTANT marker), dedupes against a persisted seen-set, and fires Web Notifications via
`pushNotify`. Gated by `nudge-policy.ts`: batched ≥90 min apart, never on days off, never in
quiet hours, never during a focus session. This is the always-there nudge layer while you
have Xanî open somewhere.

## 2. App-closed path (foundation shipped; delivery is the Mac step)

`runWatch` can't help when every window is closed — but the sidecar runs always (launchd
service). So the **decision** of what deserves to interrupt you when the app is closed lives
in the sidecar:

- `sidecar/notify.ts` — `decideNotifications()`, pure and unit-tested. Fires only for
  model-triaged Slack **emergencies** and a single **"morning brief is ready"** per day.
  Never on a day off, never outside waking hours, each thing deduped by a stable key.
- `GET /notifications/pending` — what should fire right now (does **not** mutate).
- `POST /notifications/ack {keys}` — records delivered keys in the kv ledger so nothing
  fires twice; the ledger self-prunes after a few days.

The ack pattern means a delivery failure never silently swallows a notification: the
deliverer only acks after it has actually shown them.

### The remaining delivery shim (verify on macOS)

Something always-on must poll `/notifications/pending`, show each via the OS, then
`/notifications/ack` it. Two options, both need to be built and verified on the Mac:

- **Tauri-resident (preferred):** the tray app stays resident with its window closed; its
  Rust backend polls the sidecar and fires `tauri-plugin-notification`. Composes with the
  existing system tray (lib.rs `setup_tray`).
- **Sidecar-native:** the launchd sidecar fires directly (e.g. macOS `osascript`/
  `terminal-notifier`). Simpler, but platform-specific and outside the "no shell exec"
  convention — only if the Tauri path proves awkward.

**Do not** wire the sidecar decision engine to a renderer poller — that would double-fire
against `runWatch` (path 1). The engine is exclusively the app-closed brain.
