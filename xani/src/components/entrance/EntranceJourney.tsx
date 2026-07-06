'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * The entrance journey — the storyboard's arc rebuilt with a real WebGL portal (React Three
 * Fiber, in PortalScene) behind a Framer-Motion overlay. Plays on every load/refresh and
 * masks data-loading (Home mounts underneath and fetches while this runs), then dissolves to
 * reveal it. Honours prefers-reduced-motion with a still, calm fade (no WebGL), and falls
 * back gracefully if WebGL is unavailable.
 */

const PortalScene = dynamic(() => import('./PortalScene'), { ssr: false });

const DURATION = 4800;
const REDUCED = 1100;
const LEAVE = 720;

const TOOLS = ['Inbox', 'Calendar', 'Slack', 'Trello', 'Notes', 'Drive'];

/** If WebGL throws, don't take the app down — fall back to the warm ivory backdrop. */
class WebGLBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

function Sunburst() {
  const petals = Array.from({ length: 32 }, (_, i) => i);
  return (
    <svg className="xj-burst" viewBox="-60 -60 120 120" aria-hidden>
      <defs>
        <radialGradient id="xjCore2" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff7e6" />
          <stop offset="45%" stopColor="#e8c68a" />
          <stop offset="100%" stopColor="#c9a76b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="xj-burst-rays">
        {petals.map((i) => (
          <rect key={i} x={-0.7} y={-52} width={1.4} height={i % 2 ? 20 : 30} rx={0.7}
            fill="#cda96c" opacity={i % 2 ? 0.5 : 0.85} transform={`rotate(${(360 / petals.length) * i})`} />
        ))}
      </g>
      <circle r={11} fill="url(#xjCore2)" className="xj-burst-core" />
    </svg>
  );
}

export function EntranceJourney({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  const [leaving, setLeaving] = useState(false);
  const total = reduce ? REDUCED : DURATION;

  useEffect(() => {
    const leaveAt = window.setTimeout(() => setLeaving(true), Math.max(0, total - LEAVE));
    const doneAt = window.setTimeout(onDone, total);
    const bail = () => { setLeaving(true); window.setTimeout(onDone, LEAVE); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') bail(); };
    window.addEventListener('keydown', onKey);
    return () => { window.clearTimeout(leaveAt); window.clearTimeout(doneAt); window.removeEventListener('keydown', onKey); };
  }, [onDone, total]);

  // Shared easing for the calm, deliberate reveals.
  const rise = (delay: number) => ({
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 1.1, delay, ease: [0.2, 0.7, 0.2, 1] as [number, number, number, number] },
  });

  return (
    <motion.div
      className="xj-root"
      initial={{ opacity: 1 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: LEAVE / 1000, ease: [0.4, 0, 0.2, 1] }}
      role="presentation"
    >
      {!reduce && (
        <div className="xj-scene">
          <WebGLBoundary><PortalScene /></WebGLBoundary>
        </div>
      )}
      <div className="xj-vignette" />

      <div className="xj-overlay">
        {/* the mark arrives as we reach the gateway */}
        <motion.div
          className="xj-mark"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, delay: reduce ? 0 : 2.2, ease: [0.2, 0.7, 0.2, 1] }}
        >
          <Sunburst />
        </motion.div>

        {/* the invitation */}
        <div className="xj-words">
          <motion.div className="xj-word" {...rise(reduce ? 0.1 : 0.5)}>Your world.</motion.div>
          <motion.div className="xj-word xj-word-em" {...rise(reduce ? 0.2 : 0.95)}>Woven together.</motion.div>
        </div>

        {/* the tools weaving in (subtle over the 3D corridor) */}
        {!reduce && (
          <div className="xj-tools">
            {TOOLS.map((t, i) => (
              <motion.span key={t} className="xj-tool"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 2.5 + i * 0.12, ease: [0.3, 0.7, 0.2, 1] }}>
                {t}
              </motion.span>
            ))}
          </div>
        )}

        <motion.div className="xj-sub"
          initial={{ opacity: 0 }} animate={{ opacity: 0.9 }}
          transition={{ duration: 1.1, delay: reduce ? 0.3 : 2.9 }}>
          Gathering your day…
        </motion.div>
      </div>

      {!reduce && (
        <motion.button type="button" className="xj-skip"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6, duration: 0.8 }}
          onClick={() => { setLeaving(true); window.setTimeout(onDone, LEAVE); }}>
          Enter&nbsp;→
        </motion.button>
      )}

      <style>{CSS}</style>
    </motion.div>
  );
}

const CSS = `
.xj-root{position:fixed;inset:0;z-index:120;overflow:hidden;color:#2a2620;
  background:radial-gradient(120% 90% at 50% 45%, #fbf7ee 0%, #f2ece0 45%, #e9e1d2 100%);
  -webkit-font-smoothing:antialiased;}
.xj-scene{position:absolute;inset:0;}
.xj-scene canvas{display:block;width:100%!important;height:100%!important;}
.xj-vignette{position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(120% 100% at 50% 45%, transparent 55%, rgba(120,96,52,.12) 100%);
  mix-blend-mode:multiply;}
.xj-overlay{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;}
.xj-overlay>*{grid-area:1/1;}

.xj-mark{filter:drop-shadow(0 0 26px rgba(230,196,138,.7));}
.xj-burst{width:18vmin;height:18vmin;}
.xj-burst-rays{transform-origin:50% 50%;animation:xjSpin 26s linear infinite;}
.xj-burst-core{transform-origin:50% 50%;animation:xjCoreBreath 3.4s ease-in-out infinite;}
@keyframes xjSpin{to{transform:rotate(360deg)}}
@keyframes xjCoreBreath{0%,100%{transform:scale(1);opacity:.9}50%{transform:scale(1.12);opacity:1}}

.xj-words{position:absolute;bottom:15vh;text-align:center;}
.xj-word{font-family:var(--font-playfair),Georgia,serif;font-weight:500;line-height:1.05;
  font-size:clamp(30px,6.4vmin,58px);color:#332d24;text-shadow:0 2px 30px rgba(255,247,228,.6);}
.xj-word-em{font-style:italic;color:#8a6d34;}

.xj-tools{position:absolute;bottom:26vh;display:flex;gap:10px;flex-wrap:wrap;justify-content:center;max-width:74vw;}
.xj-tool{font-family:var(--font-inter),system-ui,sans-serif;font-size:12.5px;font-weight:600;letter-spacing:.02em;
  color:#5b5140;background:rgba(255,252,245,.8);border:1px solid rgba(201,167,107,.35);
  padding:6px 12px;border-radius:11px;white-space:nowrap;box-shadow:0 6px 20px rgba(120,96,52,.10);backdrop-filter:blur(3px);}

.xj-sub{position:absolute;bottom:8vh;font-family:var(--font-inter),system-ui,sans-serif;
  font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#9a8a6c;}

.xj-skip{position:absolute;right:22px;bottom:20px;z-index:2;pointer-events:auto;
  font-family:var(--font-inter),system-ui,sans-serif;font-size:12px;letter-spacing:.06em;
  color:#9a8a6c;background:transparent;border:0;cursor:pointer;padding:8px;transition:color .2s;}
.xj-skip:hover{color:#5b5140;}
`;
