# Using Xanî from your iPhone (GitHub Codespaces)

Run Xanî on a cloud machine (a Codespace) and open it in Safari on your phone — no Mac
needed, no Tailscale. Your Mac being off is fine. The Codespace runs the app **and** the
`claude` CLI logged into your Claude subscription, so the AI is free (no API key).

One-time cost note: Codespaces has a free monthly allowance; a Codespace **sleeps when
idle** and you restart it from the phone in ~30s. It is not truly always-on (that's a VPS).

---

## First time (~5 minutes, from your phone or a computer)

1. **Create the Codespace.** On GitHub, open the `marvin-template` repo → **Code ▾** →
   **Codespaces** → **Create codespace**. Wait for it to build (installs Node, the app,
   and the `claude` CLI automatically).

2. **Log the Codespace into your Claude subscription.** In the Codespace **Terminal**, run:

   ```
   claude
   ```

   Type `/login`, choose **Claude account with subscription**, and it shows a link + code.
   Open the link on your phone, sign in as your Claude account, approve. Back in the
   terminal, `/exit`.

3. **Start Xanî.** In the terminal:

   ```
   cd xani && npm run dev:remote
   ```

   This runs the UI, the AI runtime, and a proxy that puts everything on **one port: 8080**.

4. **Open it on your phone.** In the Codespace, open the **Ports** panel, find port **8080**
   ("Xanî — open THIS on your phone"), copy its URL, and open it in Safari. Sign in with
   GitHub if asked (the port is private to your account). That's the app.

5. **Reconnect your accounts.** The Codespace is a fresh machine, so open **Settings /
   Connections** in the app and paste your Slack / Gmail / Gemini creds again (they live on
   the machine that runs the app, not in git). Do this once.

---

## Every time after

- If the Codespace is stopped: GitHub → Codespaces → click it → **Resume**, then in the
  terminal `cd xani && npm run dev:remote`, and open the port-8080 URL on your phone.
- To stop cleanly: `Ctrl-C` in the terminal (or just let it sleep).

---

## How it works (so it's not magic)

The app's UI and the AI runtime are normally two ports. `npm run dev:remote` adds a small
reverse proxy (`scripts/serve-remote.mjs`) that serves the UI and routes AI calls
(`/__mv/*`) to the runtime — all behind **one** origin. That's why the phone only needs one
URL and there's no cross-site/CORS setup. The app auto-detects it's not on localhost and
talks to the runtime at `/__mv` (see `resolveSidecarUrl` in `src/lib/marvin-client.ts`).

## Prefer truly always-on?

A cheap VPS (Hetzner/Fly/Railway) runs 24/7 with no sleep. The exact same
`npm run dev:remote` + one-port setup works there; you'd expose port 8080 (behind auth) and
point your phone at it. Ask and I'll script the VPS path.
