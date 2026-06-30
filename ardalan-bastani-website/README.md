# Ardalan Bastani — interactive portrait

An interactive, **trilingual** (English · German · Kurdish/Sorani) website for the Kurdish
writer, poet and theatre-maker **Ardalan Bastani** (ئەردەلان باستانی) — from Bukan in Iranian
Kurdistan, based in Berlin.

Editorial-futurist art direction: ink-and-gold palette, kinetic serif type, a custom cursor,
scroll-reveal motion, film grain, and a **WebGL portrait relief** that displaces by image depth
and reacts to the cursor (chromatic split, sculpted light, vignette). His real photographs are
treated as **duotone graphics + a halftone screen-print** — no AI-generated imagery.

## Run it

```bash
cd ardalan-bastani-website
python3 -m http.server 8000      # then open http://localhost:8000
```

`index.html` is the deployable site (HTML + `assets/`). `preview.html` is a single
self-contained file (everything inlined, incl. the 3D) for quick sharing.

## Structure

```
ardalan-bastani-website/
├── index.html
├── preview.html                 # self-contained single-file build
├── assets/
│   ├── css/styles.css
│   ├── js/
│   │   ├── i18n.js              # EN / DE / KU strings
│   │   ├── main.js             # cursor, reveals, magnetic, marquee, lang, preloader
│   │   ├── hero.js             # WebGL portrait relief (Three.js, ES module)
│   │   └── vendor/three.module.min.js
│   └── img/
│       ├── originals/          # the 5 real source photos (untouched)
│       ├── *-color.webp        # cleaned full-colour versions
│       ├── *-duo.webp          # ink→gold duotone graphics (gallery default)
│       ├── hero-color.webp     # texture for the WebGL relief
│       └── gaze-halftone.webp  # halftone screen-print poster (About)
└── README.md
```

The photos are processed from the originals by `scripts/process-images.py` (duotone LUT +
clustered-dot halftone). Re-run it if you swap in new source photos.

## Languages

Switcher top-right: **EN / DE / کوردی**. Kurdish renders right-to-left; choice is remembered.
Edit copy in `assets/js/i18n.js`.

## 3D / performance notes

- The hero uses **Three.js** (vendored locally — no CDN, works offline). If WebGL is
  unavailable it falls back to a static duotone portrait automatically.
- Honours `prefers-reduced-motion` (disables the heavy motion + displacement).
- Fonts load from Google Fonts; everything else is self-hosted.

## Still to confirm / fill in

- **Book covers** — drop `book-1.jpg` and `book-2.jpg` into `assets/img/` (they currently show
  a gradient placeholder).
- **Book titles & blurbs** — the first cover reads *Tendûr* (تەندوور); confirm the exact title
  and add the second book's title + description in `i18n.js` (`book1_*`, `book2_*`).
- **Email** — Connect section (`index.html`, the `data-edit="email"` link).

## Deploy (free)

GitHub Pages, Netlify, Vercel or Cloudflare Pages — no build step; serve this folder as-is.

## Sources for the biography

Rosa-Luxemburg-Stiftung profile · nd-aktuell interview · syn:format · Instagram
[@ardalan.bastani](https://www.instagram.com/ardalan.bastani/) · publisher
[49Books](https://book.krd/publisher/49books/).
