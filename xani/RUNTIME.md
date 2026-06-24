# Xanî — Runtime Setup (going live)

This guide takes Xanî from "every path works locally" to "actions actually happen."
It covers the two processes, where credentials live, the exact `.env` keys, and a
full **Trello card end-to-end** walkthrough you can do in ~10 minutes.

---

## 1. The two processes

Xanî runs as **two local processes**:

| Process | Command | What it is |
|---------|---------|------------|
| **UI** | `npm run dev` | The Next.js app (the windows you click) → http://localhost:3000 |
| **Runtime (sidecar)** | `npm run sidecar` | A small Node server on `localhost:8787` that owns all credentials and makes the real Gmail/Calendar/Slack/Trello/Buffer/Anthropic calls. |

The UI never holds secrets. When you approve an action, the UI calls the sidecar
(`POST /act`) and the sidecar performs it. If the sidecar isn't running, approvals
are recorded and marked "will run when the runtime is on" — they don't silently fail.

```bash
cd ~/marvin-template/xani
npm install
npm run dev        # terminal 1
npm run sidecar    # terminal 2
```

---

## 2. Where credentials live

- **Dev (running `npm run sidecar`):** the sidecar reads a plain **`xani/.env`** file.
  Copy the template and fill it in:
  ```bash
  cp .env.example .env
  ```
  `.env` is gitignored — your secrets never get committed.

- **Packaged desktop app (`tauri build`):** secrets are stored in the **OS keychain**.
  Connecting an integration in the UI (Connections → Connect → "credentials") writes
  them to the keychain via a Rust command; the Rust side injects them into the
  sidecar's environment at launch. No `.env` needed on desktop.

Either way: **add a credential → restart the sidecar** so it picks it up.

---

## 3. The `.env` keys (what each unlocks)

```ini
# Required for MARVIN to think (chat + Studios + drafting)
ANTHROPIC_API_KEY=sk-ant-…

# Trello — read cards + create cards on approval
TRELLO_API_KEY=
TRELLO_TOKEN=
TRELLO_BOARD_ID=683dafe308be04e369b8434c

# Buffer — read queue counts + draft posts on approval
BUFFER_ACCESS_TOKEN=

# Slack (Amargi) — read #general/#tt-arabic + post on approval (LeadStories is monitor-only)
SLACK_AMARGI_BOT_TOKEN=xoxb-…

# Google Calendar — read today + create/hold events on approval
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_REFRESH_TOKEN=

# Google Drive — browse files
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_REFRESH_TOKEN=

# Gmail (per account, _1 … _5) — read unread + send on approval
GMAIL_CLIENT_ID_1=
GMAIL_CLIENT_SECRET_1=
GMAIL_REFRESH_TOKEN_1=

# Notetaker on-device transcription (optional) — local whisper.cpp, audio never leaves the device
WHISPER_BIN=
WHISPER_MODEL=
WHISPER_ARGS=-otxt -nt
```

You only need the keys for the integrations you actually want live. Everything else
stays in its honest "Not connected" state.

---

## 4. Full walkthrough: a Trello card, end-to-end

The fastest integration to prove the whole chain (read → prepare → approve → create).

1. **Get Trello credentials**
   - API key: open <https://trello.com/power-ups/admin>, create a Power-Up, copy its **API key**.
   - Token: on the same page click **Token** (or visit the manual-token URL Trello shows) and **Allow** — copy the **token**.
   - Board ID: open your board in the browser; the URL is `trello.com/b/<BOARD_ID>/…` (or append `.json` to the board URL and copy `"id"`). The Amargi board default is already filled in.

2. **Put them in `.env`**
   ```ini
   TRELLO_API_KEY=<your key>
   TRELLO_TOKEN=<your token>
   TRELLO_BOARD_ID=<your board id>
   ```

3. **Restart the sidecar** (`Ctrl+C` in terminal 2, then `npm run sidecar`).

4. **Confirm the read works:** open **Trello** in the app — the badge should say
   **Connected** and your cards should list. (Or check directly:
   `curl localhost:8787/data/trello`.)

5. **Prepare an action:** Trello → **New card** → type a title → **Create card**.
   It goes to **Approvals** (banner: "Sent to Approvals").

6. **Approve it:** open **Approvals** → the card is waiting → **Create card** →
   confirm. The sidecar calls Trello and the card appears on your real board. The
   item moves out of the queue and the banner says **Done**.

That's the entire trust-gated action loop working for real. Inbox (send email),
Buffer (schedule post), Calendar (hold focus), and Slack (post) work the same way
once their keys are set.

---

## 4b. Sign in with Google (Gmail / Calendar / Drive) — the one-time setup

Xanî now has a real **"Sign in with Google"** (desktop loopback OAuth). It opens
Google, you approve, and it connects automatically — no copy-pasting tokens. But
because Xanî is *your own* app (not a Google-verified company app), you create a
free Google OAuth client **once**. ~5 minutes:

1. Go to <https://console.cloud.google.com> → create/select a project.
2. **APIs & Services → Library** → enable the APIs you want: **Gmail API**,
   **Google Calendar API**, **Google Drive API**.
3. **APIs & Services → OAuth consent screen** → User type **External** → fill the app
   name + your email → **Add users** → add *your own* Google address as a **Test user**
   (this lets you use it immediately without Google verification).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** →
   Application type **Desktop app** → Create → copy the **Client ID** and **Client secret**.
5. In Xanî: **Connections → Gmail → Connect → Sign in with Google** → paste the
   Client ID + secret → **Sign in with Google**. Your browser opens Google; approve.
   (You'll see *"Google hasn't verified this app"* — that's normal for a personal
   client; click **Advanced → Go to Xanî**.) Done — the card flips to **Live** and
   your inbox appears.

You do step 1–4 once; afterwards every Google sign-in is one click. The same client
works for Calendar and Drive (just enable those APIs and Connect them too).

## 4c. Sign in with GitHub (one-click, like Google)

GitHub also supports the loopback flow, so it gets a real one-click sign-in too:

1. <https://github.com/settings/developers> → **OAuth Apps → New OAuth App**.
2. **Authorization callback URL** must be exactly `http://127.0.0.1:8788` (Xanî's
   loopback port). Homepage URL can be anything.
3. Create it → copy the **Client ID**, then **Generate a new client secret** → copy it.
4. In Xanî: **Connections → GitHub → Connect → Sign in with GitHub** → paste both →
   sign in → approve. The card flips to **Live** and your assigned issues/PRs appear.

> If you ever change Xanî's loopback port (`MARVIN_OAUTH_PORT`), update the callback
> URL to match.

## 5. The other integrations (quick notes)

- **Anthropic key** — without it, MARVIN chat and Studio drafting return an error;
  everything else still works. Set `ANTHROPIC_API_KEY` and restart the sidecar.
- **Gmail / Calendar / Drive** — these use Google OAuth **refresh tokens**. Create an
  OAuth client in the Google Cloud console, authorise the scopes once, and store the
  client id/secret + refresh token. (Gmail is per-account: `…_1` … `…_5`.)
- **Slack** — create a Slack app, add a bot token (`xoxb-…`) with `channels:history`,
  `channels:read`, `chat:write`. **LeadStories Slack is monitor-only** — Xanî refuses
  to post there by design.
- **Buffer** — get a personal access token at
  <https://publish.buffer.com/settings/api>.

---

## 6. Notetaker on-device transcription (optional)

Transcription runs a **local** whisper binary — audio never leaves your machine.

1. Build/install [whisper.cpp](https://github.com/ggerganov/whisper.cpp) and download a
   model (e.g. `ggml-base.en.bin`).
2. Set in `.env`:
   ```ini
   WHISPER_BIN=/path/to/whisper.cpp/main
   WHISPER_MODEL=/path/to/ggml-base.en.bin
   ```
3. Restart the sidecar. In **Notetaker**, record a session → **Transcribe (on-device)**
   → the transcript is appended to the notes. Without `WHISPER_BIN` set, the button
   tells you it isn't configured (no cloud fallback, ever).

> Note: whisper.cpp wants 16 kHz WAV; the browser records WebM. If your whisper build
> doesn't decode WebM directly, point `WHISPER_BIN` at a small wrapper script that runs
> `ffmpeg` to convert first, then whisper.

---

## 7. Desktop app (Tauri) — verify on macOS

The cloud sandbox can't compile Rust, so verify the native shell on your Mac:

```bash
cd ~/marvin-template/xani
npm run sidecar:build     # bundles the sidecar to a self-contained binary (needs Bun)
npm run tauri build       # builds the desktop app (needs the Rust toolchain)
```

On desktop, credentials entered in **Connections → Connect → credentials** are saved
to your **OS keychain** (no `.env`), and the keychain values are injected into the
sidecar at launch. The OAuth **browser sign-in** handshake is the remaining piece to
wire for the one-click "Sign in with Google" path; the credential-paste path is fully
functional today.

---

*Rule of thumb: add a key → restart the sidecar → the matching screen flips to
"Connected" and its actions execute on approval. No key → honest empty/not-connected
states, never fake data.*
