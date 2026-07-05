# First real run on your Mac — a 10-minute checklist

Written for you, Rebaz — no developer needed. Do these in order. If something looks wrong,
the **Health check** (step 4) will tell you what and how to fix it in plain language.

## 1. Get the app running
```
cd xani
npm install          # first time only
npm run app:build    # builds the UI
npm run sidecar      # starts the always-on runtime (MARVIN's brain) on 127.0.0.1:8787
```
Open http://localhost:8787 (or launch the desktop app if you've built it). If the page
loads, the runtime is alive.

## 2. Put your keys where the runtime can read them
Secrets live in `.env.local` (never committed). Copy the template and fill in what you have:
```
cp .env.example .env.local
```
You don't need everything at once — add one integration, check it, add the next. The ones
that unlock the most:
- **Gmail x5** (`GMAIL_CLIENT_ID_1..5`, `GMAIL_CLIENT_SECRET_1..5`, `GMAIL_REFRESH_TOKEN_1..5`)
  — powers triage, the morning brief, and silence detection.
- **Slack** (`SLACK_*_USER_TOKEN` / `SLACK_*_BOT_TOKEN`) — the user token is what lets MARVIN
  search and read; the bot token posts. Emergencies come from here.
- **Google Calendar** (`GOOGLE_CALENDAR_*`) — feeds the brief's "today" line.
- **Trello** (`TRELLO_API_KEY`, `TRELLO_TOKEN`, `TRELLO_BOARD_ID`) — due cards in the brief.

Restart `npm run sidecar` after editing `.env.local` so it picks up the new values.

## 3. Connect from the UI (alternative to editing files)
The **Connections** page walks each integration through its sign-in and stores the keys in
the runtime for you. Either path works; use whichever you prefer.

## 4. Run the Health check ← the important one
On the **Connections** page, click **Run check**. For every integration you'll see one of:
- 🟢 **Working** — it's live.
- ⚪ **Not connected yet** — add its credentials.
- 🔴 **Needs you** — with the exact reason and fix, e.g. *"Sign-in has expired — reconnect
  this account."* This is how you'll know *why* the brief is empty instead of guessing.

Fix anything red, then **Re-check**.

## 5. See the proactive features come alive
Once Gmail + Slack are green, open **Home**. Within a few seconds you should see:
- **MARVIN — this morning**: the brief (empty and calm if nothing genuinely needs you).
- **From inbox / From Slack — needs you**: triaged items, with a **due** chip when a message
  named a deadline.
- **Still waiting on a reply**: emails you sent that went quiet — each with **Draft a nudge**.

## What to tell me afterwards
Two things, and I'll tune from them:
1. Does **silence detection** surface the right threads, or is it too eager / too shy? (It has
   never run against your real mail, so this is the one thing I genuinely can't predict.)
2. Any integration stuck **red** in the Health check that the hint didn't resolve.

## Still to build (needs your Mac, not your keys)
- **Notifications when the app is closed** — the decision engine is done and tested; the
  delivery shim (a resident tray app polling the runtime) is the remaining piece. See
  `docs/notifications.md`.
