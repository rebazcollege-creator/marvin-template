'use client';

import type { CSSProperties } from 'react';

/**
 * Aurora Glass Orb — a translucent glass sphere with soft northern-lights ribbons
 * (aqua / emerald / blue / violet), a white glass highlight, two thin tilted orbit
 * rings, drifting sparks and a whisper of voice bars. Pure CSS/React, no assets.
 * Calm breathing motion; honours prefers-reduced-motion via [data-xani-orb].
 * Same API as before: a button that fires onClick.
 */

const SIZE = 248;

const sphere: CSSProperties = {
  position: 'absolute',
  inset: 0,
  borderRadius: '50%',
  overflow: 'hidden',
  background: [
    'radial-gradient(circle at 32% 24%, rgba(255,255,255,.95), rgba(255,255,255,.34) 14%, transparent 26%)',
    'radial-gradient(circle at 42% 44%, rgba(125,245,214,.72), transparent 42%)',
    'radial-gradient(circle at 68% 58%, rgba(115,155,255,.62), transparent 50%)',
    'radial-gradient(circle at 50% 50%, #8df7e6 0%, #426ddf 46%, #352067 100%)',
  ].join(', '),
  boxShadow:
    '0 18px 50px -18px rgba(66,109,223,.55), inset -10px -16px 42px rgba(53,32,103,.55), inset 14px 16px 40px rgba(255,255,255,.4), inset 0 0 30px rgba(125,245,214,.25)',
  animation: 'auroraOrbBreath 7s ease-in-out infinite',
};

const ribbonBase: CSSProperties = {
  position: 'absolute',
  inset: '-30%',
  borderRadius: '50%',
  mixBlendMode: 'screen',
  filter: 'blur(3px)',
};

export function Orb({ onClick }: { onClick?: () => void }) {
  return (
    <div
      data-xani-orb
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label="Xanî"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick?.();
      }}
      style={{
        position: 'relative',
        width: 320,
        height: 320,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '6px 0 2px',
        cursor: 'pointer',
      }}
    >
      {/* soft aqua/violet halo */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 320,
          height: 320,
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 50% 50%, rgba(125,245,214,.34), rgba(115,155,255,.22) 45%, rgba(139,92,246,.16) 62%, transparent 74%)',
          filter: 'blur(20px)',
        }}
      />

      {/* tilted orbit rings */}
      <div
        style={{
          position: 'absolute',
          width: SIZE * 1.22,
          height: SIZE * 1.22,
          borderRadius: '50%',
          border: '1.5px solid rgba(180,235,255,.55)',
          transform: 'rotate(28deg) scaleY(0.34)',
          boxShadow: '0 0 10px rgba(160,225,255,.4)',
          animation: 'auroraOrbitPulse 5s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: SIZE * 1.16,
          height: SIZE * 1.16,
          borderRadius: '50%',
          border: '1.5px solid rgba(190,180,255,.45)',
          transform: 'rotate(-22deg) scaleY(0.28)',
          boxShadow: '0 0 10px rgba(190,180,255,.35)',
          animation: 'auroraOrbitPulse 6.5s ease-in-out infinite 1s',
        }}
      />

      {/* the glass sphere */}
      <div style={{ position: 'relative', width: SIZE, height: SIZE }}>
        <div style={sphere}>
          {/* aurora ribbon A — aqua/emerald, drifting left↔right */}
          <div
            style={{
              ...ribbonBase,
              background:
                'conic-gradient(from 20deg at 50% 50%, transparent 0%, rgba(125,245,214,0) 6%, rgba(75,227,166,.95) 24%, rgba(160,255,225,.85) 36%, rgba(75,227,166,.2) 52%, transparent 100%)',
              animation: 'auroraRibbonA 11s ease-in-out infinite',
            }}
          />
          {/* aurora ribbon B — violet/blue, rotating slowly */}
          <div
            style={{
              ...ribbonBase,
              background:
                'conic-gradient(from 140deg at 50% 50%, transparent 0%, rgba(139,92,246,.85) 20%, rgba(168,130,255,.8) 34%, rgba(115,155,255,.5) 48%, rgba(115,155,255,0) 64%, transparent 100%)',
              animation: 'auroraRibbonB 26s linear infinite',
            }}
          />
          {/* soft white/cyan inner mist */}
          <div
            style={{
              ...ribbonBase,
              filter: 'blur(10px)',
              background:
                'radial-gradient(circle at 50% 62%, rgba(255,255,255,.4), rgba(180,255,240,.14) 40%, transparent 70%)',
              animation: 'auroraRibbonC 9s ease-in-out infinite',
            }}
          />
          {/* white glass highlight */}
          <div
            style={{
              position: 'absolute',
              top: '13%',
              left: '20%',
              width: '36%',
              height: '28%',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,255,255,.92), rgba(255,255,255,0) 70%)',
              filter: 'blur(1px)',
            }}
          />
          {/* tiny glow sparks inside the glass */}
          {[
            { top: '30%', left: '60%', d: '0s' },
            { top: '58%', left: '38%', d: '1.1s' },
            { top: '46%', left: '70%', d: '2.2s' },
            { top: '68%', left: '56%', d: '0.6s' },
          ].map((s, i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                top: s.top,
                left: s.left,
                width: 3,
                height: 3,
                borderRadius: '50%',
                background: '#fff',
                boxShadow: '0 0 6px 1px rgba(200,255,245,.9)',
                animation: `auroraSpark 3.4s ease-in-out infinite ${s.d}`,
              }}
            />
          ))}
        </div>
      </div>

      {/* whisper of voice bars near the bottom — minimal */}
      <div style={{ position: 'absolute', bottom: 14, display: 'flex', alignItems: 'flex-end', gap: 3, height: 12, opacity: 0.5 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            style={{
              width: 2.5,
              height: '100%',
              borderRadius: 2,
              background: 'linear-gradient(to top, rgba(75,227,166,.9), rgba(115,155,255,.9))',
              transformOrigin: 'bottom',
              animation: `orbBar ${1.6 + i * 0.15}s ease-in-out infinite ${i * 0.12}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
