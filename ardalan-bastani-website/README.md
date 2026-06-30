# Ardalan Bastani — personal website

A clean, fast, **trilingual** (English · German · Kurdish/Sorani) one-page site
for the Kurdish writer, playwright and theatre-maker **Ardalan Bastani**
(ئەردەلان باستانی) — from Bukan in Iranian Kurdistan, based in Berlin.

No build step, no dependencies. Just static HTML, CSS and a little JavaScript —
open it or drop it on any host.

## Run it locally

```bash
cd ardalan-bastani-website
python3 -m http.server 8000
# open http://localhost:8000
```

Or simply double-click `index.html`.

## Structure

```
ardalan-bastani-website/
├── index.html              # the page
├── assets/
│   ├── css/styles.css      # styling (theatre-dark + amber)
│   ├── js/i18n.js          # EN / DE / KU translations
│   ├── js/main.js          # language switch, mobile nav
│   └── img/                # your photos go here (see img/README.md)
└── README.md
```

## Languages

A switcher in the top-right toggles **EN / DE / کوردی**. Kurdish renders
right-to-left automatically. The choice is remembered between visits. To edit any
wording, open `assets/js/i18n.js` — every text block has a key shared across the
three languages.

## Add the photos

See [`assets/img/README.md`](assets/img/README.md). Add `portrait.jpg`,
`book-1.jpg`, `book-2.jpg` with those exact names — nothing else to change.

## Things to confirm / fill in

The biography is drawn from public sources (see below). A few details are left as
clearly-marked placeholders for Ardalan to confirm:

- **Book titles & blurbs.** The first cover on his Instagram reads *Tendûr*
  (تەندوور) — confirm the exact full title, and add the title + description of the
  **second** book in `i18n.js` (keys `book2_title`, `book2_desc`, etc.).
- **Email address** in the Connect section (`index.html`, the `data-edit="email"`
  link).
- Any **theatre dates/venues** you'd like to add.

## Deploy (free options)

- **GitHub Pages** — push this folder, enable Pages on the branch.
- **Netlify / Vercel** — drag-and-drop the folder, or connect the repo.
- **Cloudflare Pages** — connect the repo, no build command, output = this folder.

## Sources used for the biography

- Rosa-Luxemburg-Stiftung — author profile (theatre work, biography)
- nd-aktuell.de — interview on the women's uprising in Iran
- syn:format (synformat.org) — contributors
- Instagram: [@ardalan.bastani](https://www.instagram.com/ardalan.bastani/)
- Publisher: [49Books](https://book.krd/publisher/49books/) · 49plusbooks.com

> Note: some details (exact book titles) could not be fully verified from text
> sources and are marked as placeholders above. Please confirm before publishing.
