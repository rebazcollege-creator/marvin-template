# Web Performance — the complete playbook (and Xanî audit)

A comprehensive field guide to *why pages and data feel slow* and *every trick to make
a UI feel fast and smooth*. Grounded in current (2025–2026) guidance from web.dev,
Chrome, MDN and React/Next docs, plus hard-won practice. The last section audits Xanî
specifically.

There are **two kinds of speed**: *actual* (milliseconds the machine spends) and
*perceived* (how fast it feels). You must win both. Humans notice delay around
**100 ms**, lose flow around **1 s**, and abandon around **3 s**.

---

## 0. The scoreboard: Core Web Vitals (2025)

Aim for the "good" bucket at the **75th percentile** of real users:

| Metric | Measures | Good | Poor |
|--------|----------|------|------|
| **LCP** (Largest Contentful Paint) | loading — when the main content appears | **≤ 2.5 s** | > 4 s |
| **INP** (Interaction to Next Paint) | responsiveness — tap→visual feedback (replaced FID in Mar 2024) | **≤ 200 ms** | > 500 ms |
| **CLS** (Cumulative Layout Shift) | visual stability — things jumping | **≤ 0.1** | > 0.25 |

Supporting: **TTFB** (server response), **FCP** (first paint), **TBT** (total blocking
time — the lab proxy for INP). A 0.1 s speed-up can lift conversion ~8%.

---

## 1. Network & loading mistakes (the "landing page is slow" list)

Most landing-page slowness is **too many bytes, too many round-trips, and render-blocking
resources** — not your framework.

**Mistakes**
- Huge unoptimized **images/video** (the #1 cause) — multi-MB hero JPEGs/PNGs, autoplay video.
- **Render-blocking** CSS/JS in `<head>` delaying first paint.
- **Too many third-party scripts** (analytics, chat, pixels, A/B, tag managers) — each is JS + a connection + main-thread time you don't control.
- **Request waterfalls**: A loads → then B → then C, serially.
- No **compression** (Brotli/gzip), no **caching headers**, no **CDN**.
- Shipping the **whole app** to render one screen (no code splitting).
- Too many DOM nodes (heavy, deep trees → slow layout/paint).

**Fixes**
- **Compress everything**: Brotli (or gzip) for text; modern image formats.
- **CDN + cache**: static assets with long `Cache-Control: max-age, immutable` (hashed filenames); HTML with sensible TTL.
- **Reduce requests**: bundle/HTTP-2 multiplex; remove dead deps; audit third parties ruthlessly (lazy-load chat/analytics, or run them in a worker via Partytown).
- **Preconnect** to required origins: `<link rel="preconnect">` for fonts/CDN/API; `dns-prefetch` for the rest.
- **Preload** the LCP image / critical font with `fetchpriority="high"`.
- Kill waterfalls — see §7.

---

## 2. Images & media (usually the biggest win)

- Serve **AVIF/WebP** with fallbacks; compress aggressively (target quality, not size by eye).
- **Responsive images**: `srcset`/`sizes` so phones don't download desktop pixels.
- **Always set `width`/`height`** (or `aspect-ratio`) → reserves space → no CLS.
- **Lazy-load** below-the-fold: `loading="lazy"`; eager + `fetchpriority="high"` for the LCP hero.
- `decoding="async"`; don't lazy-load the LCP image (it delays LCP).
- Video: `preload="metadata"`, poster image, never autoplay heavy video on a landing page.
- Use the framework image component (`next/image`) for automatic sizing, format negotiation, lazy-loading, and `priority` for the hero.

---

## 3. Fonts (a top cause of invisible text + layout shift)

- **WOFF2** only (best compression). **Subset** to the glyphs/languages you use.
- **`font-display: swap`** for body/nav (show fallback instantly, swap in) — or `optional` for the most aggressive no-shift behavior.
- **Self-host** and **`<link rel="preload" as="font" crossorigin>`** the 1–2 critical fonts (don't preload everything — it backfires).
- Match the fallback metrics (`size-adjust`, `ascent-override`, or `font-family: ... , system-ui`) to minimize the swap shift. Next.js `next/font` does most of this automatically (self-host, preload, fallback metrics).
- Avoid loading 6 weights when you use 2.

---

## 4. CSS & the critical rendering path

- **Inline critical CSS**, defer the rest; CSS is render-blocking by default.
- Ship less CSS: purge unused (Tailwind does this via content scanning), avoid giant utility/framework dumps.
- Avoid `@import` chains (serial round-trips).
- Use **`content-visibility: auto`** + `contain-intrinsic-size` on long off-screen sections to skip rendering work until they scroll near.
- Beware expensive selectors and huge stylesheets on deep DOMs.

---

## 5. JavaScript: bundle size, main thread, long tasks, INP

JS is the usual reason a page is *interactive*-slow.

**Mistakes**
- Massive bundles; importing whole libraries for one function (`import _ from 'lodash'`).
- Everything eager — no code splitting / dynamic import.
- **Long tasks** (> 50 ms) that block the main thread → janky taps, high INP.
- Heavy work (JSON parse, sorting, crypto, markdown) on the main thread.
- Unthrottled scroll/resize/input handlers; non-passive listeners.

**Fixes**
- **Code-split** by route and on interaction: `import()` / `next/dynamic` for modals, editors, charts.
- **Tree-shake**; import named members; prefer small deps; check size on [bundlephobia].
- **Break up long tasks**: chunk loops and `await scheduler.yield()` (or `setTimeout`/`requestIdleCallback`) so the browser can answer input between chunks.
- **Offload** CPU work to a **Web Worker** (or Partytown for third-party tags).
- **Debounce** input, **throttle** scroll; mark scroll/touch listeners `{ passive: true }`.
- Defer non-critical JS (`defer`/`async`); load analytics after interaction/idle.
- For INP specifically: do the *visual* response first (cheap state update / CSS), then the heavy work after a yield — the user sees feedback within a frame.

---

## 6. React: the unnecessary-re-render trap

Most React slowness = **re-rendering too much** + **bloated bundles** + **bad state placement**.

**Mistakes**
- New object/array/function literals as props every render → memoized children re-render anyway.
- One giant Context whose every change re-renders all consumers.
- State lifted too high (a keystroke re-renders the whole page).
- Rendering huge lists without virtualization.
- Missing/instable `key`s (index keys on reorderable lists).
- Expensive compute in render instead of `useMemo`.

**Fixes**
- `React.memo` leaf components; `useCallback`/`useMemo` for props passed down (or adopt the **React Compiler**, which auto-memoizes — 30–60% fewer re-renders).
- **Colocate state** as low as possible; lift only what's shared.
- Split Context by concern; memoize the provider `value`; or use a store (Zustand/Jotai) with selectors so only subscribers re-render.
- **Virtualize** long lists (react-window / virtual) — render only visible rows.
- Stable, unique keys.
- Keep the render pure and cheap; move side effects to events/effects.

---

## 7. Data: waterfalls, caching, and freshness

Slow *data* usually = **serial requests** and **no caching**, not a slow API.

**Mistakes**
- Waterfall: component A fetches, then renders B which fetches, then C…
- Re-fetching the same thing on every mount/navigation; no cache.
- Fetching in a child that could be hoisted/parallelized.
- Over-fetching (whole objects when you need 3 fields); chatty N+1 calls.
- Blocking the whole screen on the slowest query.

**Fixes**
- **Parallelize**: fire independent requests together (`Promise.all`); hoist fetches up; in RSC, start them before awaiting.
- **Cache + dedupe + revalidate** with **SWR**/React Query: return cached (stale) instantly, revalidate in the background, dedupe concurrent identical requests. Feels instant on repeat views.
- **Prefetch** likely-next data on hover/intent (SWR `preload`, router prefetch).
- **Stream** with Suspense: send the shell immediately, stream slow regions in (see §8). Don't let one slow query block everything.
- Paginate / windowed queries; request only needed fields; add an edge cache for hot reads.
- Optimistic updates for writes (see §9).

---

## 8. Next.js / Server Components / streaming

- **Default to Server Components**; the App Router renders RSC to a payload with **no client JS**. Full RSC adoption commonly cuts First-Load JS 50–70%.
- **Minimize `'use client'`** — push it to the smallest interactive leaves (buttons, inputs, modals); keep data-fetching/layout on the server.
- **Stream with `<Suspense>`**: the shell paints in <200 ms while slow data streams in — huge perceived win.
- Use **`next/image`** (sizing, formats, lazy, `priority` hero) and **`next/font`** (self-host, preload, fallback metrics).
- Pick the right rendering per route: **static** (SSG) for marketing/landing, **ISR** for semi-fresh, dynamic only when needed. Static + CDN is the fastest possible landing page.
- Audit with **`@next/bundle-analyzer`** whenever you add a dependency.
- Route **prefetching**: the `<Link>` prefetches in-viewport routes by default — keep it.

---

## 9. Perceived performance: make it *feel* instant

This is where you win the user even when the network can't be faster.

- **Respond within 100 ms, always.** On any interaction, change *something* immediately (pressed state, spinner-in-button, optimistic value) — never a dead click.
- **Optimistic UI**: apply the change in the UI right away, send the request in the background, reconcile/rollback on failure. Feels instant.
- **Skeleton screens > spinners**: users perceive skeletons (that mimic the final layout) as faster, and they prevent layout shift. Spinners for short, indeterminate waits only.
- **Micro-interactions**: a 100–150 ms fade/scale on tap "buys attention" and signals the system heard you (helps perceived INP).
- **Instant feedback then settle**: show the cheap visual result first, do the expensive work after a yield.
- **Preserve context**: don't blank the screen on navigation; keep the shell, swap content.
- **Stable layouts**: reserve space for images/async content so nothing jumps (protects CLS *and* feels solid).
- **`useTransition`/`startTransition`** (React) to keep the UI responsive during heavy state updates — input stays snappy while the expensive render is interruptible.

---

## 10. Animation & smoothness (60 fps, no jank)

- **Only animate `transform` and `opacity`** — they run on the **compositor thread**, off the main thread, no layout/paint per frame.
- **Never animate** `width/height/top/left/margin/padding` (layout) or `box-shadow/background/filter` heavily (paint) in hot loops — that's jank, especially on low-end devices.
- **`will-change: transform`** *only* right before an animation, and remove it after — it's not seasoning; overuse wastes GPU memory.
- Prefer CSS/compositor animations; for JS animation use `requestAnimationFrame`, never `setInterval`.
- Avoid **layout thrashing**: batch DOM reads then writes (read all measurements, then mutate) — interleaving forces synchronous reflows.
- Respect **`prefers-reduced-motion`** — disable non-essential motion.
- Heavy `filter: blur()`, big `backdrop-filter`, large `box-shadow`, and many simultaneously-animated layers are paint-expensive — use sparingly, keep layers small, test on a real mid-range phone.

---

## 11. Instant navigation (the modern loopholes)

- **bfcache**: instant back/forward by restoring an in-memory snapshot. Don't break it: avoid `unload` handlers, don't set `Cache-Control: no-store` on HTML, clean up open connections. Test in DevTools → Application → Back/forward cache.
- **Speculation Rules API**: declare `prefetch`/`prerender` for likely next pages → near-instant navigations. `prerender` fully loads the next page in a hidden tab. Real cases: Ray-Ban −43% LCP; Yahoo! JAPAN +9% revenue. Use conservative eagerness (on hover/moderate) to avoid wasted work.
- **Router prefetch on intent**: prefetch data/route on link hover or pointerdown.
- **Preconnect/preload** the resources the next view will need.

---

## 12. Measure (don't guess)

- **Field (RUM)**: Chrome UX Report (CrUX), `web-vitals` JS library, PageSpeed Insights (real-user data). This is what Google ranks on.
- **Lab**: Lighthouse, WebPageTest, DebugBear; DevTools **Performance** panel (long tasks, layout shifts, paint), **Coverage** (unused JS/CSS), **Network** (waterfall).
- Bundle: `@next/bundle-analyzer`, source-map-explorer, bundlephobia.
- Always test on a **throttled mid-range mobile** (4× CPU slowdown, Fast 3G) — your laptop lies.

---

## 13. The one-screen checklist

**Bytes**: Brotli · modern images (AVIF/WebP) · WOFF2 subset fonts · purge CSS/JS · CDN + immutable caching.
**Critical path**: preconnect + preload LCP image/font (`fetchpriority`) · inline critical CSS · defer the rest · set width/height on media.
**JS**: code-split routes + modals · tree-shake · break long tasks / yield · workers for heavy work · debounce/throttle · passive listeners · defer 3rd-party.
**React**: memo leaves · colocate state · split/memoize context · virtualize lists · stable keys · (React Compiler).
**Data**: parallelize · SWR/React Query cache+dedupe+revalidate · prefetch on intent · stream with Suspense · paginate · optimistic writes.
**Feel**: <100 ms feedback always · skeletons not spinners · optimistic UI · keep the shell on nav · reserve space (no CLS) · `useTransition`.
**Motion**: animate only transform/opacity · `will-change` scoped · rAF · no layout thrashing · honor reduced-motion.
**Instant nav**: keep bfcache · speculation-rules prefetch/prerender · router prefetch.
**Verify**: Lighthouse + CrUX + DevTools, throttled mobile, at p75.

---

## 14. Xanî-specific audit

**Already good**
- **Static export** (`output: export`) → the whole app is static files behind a CDN: the fastest possible delivery, great TTFB/LCP.
- **`next/font`** (Playfair + Inter) → self-hosted, preloaded, `swap`, fallback metrics — fonts are handled right.
- **No images** — the orb and all icons are pure CSS/inline SVG, so the #1 landing-page cost (images) is zero.
- **Tailwind** purges unused CSS; **strict TS + lint** keep the bundle honest; routes are small (~104–117 kB First-Load JS).
- **Honest empty/loading states + skeletons** (`.xsk` shimmer) everywhere — good perceived performance, no fake data.
- **Theme set pre-paint** via an inline script → no theme flash (CLS/flash win).
- **`prefers-reduced-motion`** handled on the new orb (`[data-xani-orb]`).

**Worth doing next (ranked)**
1. **Cache live-data reads** (SWR-style): the new auto-refresh + the data screens re-fetch on every mount. Add a tiny stale-while-revalidate cache in `marvin-data.ts` (return cached instantly, revalidate in the background, dedupe concurrent calls) → screens feel instant on revisit and we stop hammering the sidecar. *(Highest impact for "data feels slow.")*
2. **Parallelize the briefing** — already `Promise.all` in the sidecar; keep it, and make sure the home doesn't block on it (it renders the shell + orb first — good).
3. **Watch the Aurora orb's paint cost**: it stacks `filter: blur`, `mix-blend-mode: screen`, conic-gradients and several always-running animations. That's paint/GPU-heavy on low-end machines. Mitigations: it only animates `transform`/`opacity` (good), reduced-motion disables it (good); consider pausing its animations when the tab is hidden and when the orb is offscreen (`IntersectionObserver`) to save battery/CPU.
4. **`content-visibility: auto`** on long lists (Activity feed, Drive grid, Memory list) so off-screen rows skip render work.
5. **Code-split the heavy/rare components** — the command palette (`cmdk`) and the modals could be `next/dynamic` so they're not in the first-load bundle.
6. **Virtualize** Activity / Drive / Inbox once lists get long (react-window).
7. **Debounce** the automation composer / search inputs; they're cheap now but will grow.
8. **Pause the orb + live-preview polling when `document.hidden`** (the live preview already refreshes on focus; also *stop* the interval while hidden to save work).

None of these are urgent — the app is already lean (static, no images, purged CSS). #1 (SWR-style data cache) is the single biggest "feels faster" win and the natural next step.

---

## Sources

- [Defining Core Web Vitals thresholds — web.dev](https://web.dev/articles/defining-core-web-vitals-thresholds)
- [Core Web Vitals optimization guide 2025](https://www.ateamsoftsolutions.com/core-web-vitals-optimization-guide-2025-showing-lcp-inp-cls-metrics-and-performance-improvement-strategies-for-web-applications/)
- [11 common causes of slow landing page load speeds — Instapage](https://instapage.com/blog/landing-page-speeds)
- [Improving landing page performance — Shopify](https://www.shopify.com/blog/improving-landing-page-performance)
- [React performance optimization 2025 — Growin](https://www.growin.com/blog/react-performance-optimization-2025/)
- [React performance: 15 best practices for 2025 — DEV](https://dev.to/alex_bobes/react-performance-optimization-15-best-practices-for-2025-17l9)
- [Next.js App Router performance — Nordiso](https://www.nordiso.com/blog/next-js-app-router-performance-10-expert-optimization-techniques)
- [Next.js production checklist](https://nextjs.org/docs/app/guides/production-checklist)
- [App Router: Streaming — Next.js](https://nextjs.org/learn/dashboard-app/streaming)
- [Skeleton screens vs spinners — UI Deploy](https://ui-deploy.com/blog/skeleton-screens-vs-spinners-optimizing-perceived-performance)
- [INP and the illusion of speed — Made Curious](https://madecurious.com/articles/inp-and-the-illusion-of-speed/)
- [Optimistic UI patterns — Simon Hearne](https://simonhearne.com/2021/optimistic-ui-patterns/)
- [Optimize web fonts — web.dev](https://web.dev/learn/performance/optimize-web-fonts)
- [Best practices for fonts — web.dev](https://web.dev/articles/font-best-practices)
- [Animations and performance — web.dev](https://web.dev/articles/animations-and-performance)
- [Optimize long tasks — web.dev](https://web.dev/articles/optimize-long-tasks)
- [Optimize INP — web.dev](https://web.dev/articles/optimize-inp)
- [SWR — Vercel](https://swr.vercel.app/) · [Prefetching — SWR](https://swr.vercel.app/docs/prefetching)
- [Speculation Rules API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API)
- [Prerender pages in Chrome](https://developer.chrome.com/docs/web-platform/prerender-pages)
- [Ray-Ban speculation rules case study — web.dev](https://web.dev/case-studies/rayban-speculation-rules)
