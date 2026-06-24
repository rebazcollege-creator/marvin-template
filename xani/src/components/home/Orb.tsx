'use client';

import type { CSSProperties } from 'react';

/**
 * The Xanî orb — a layered terracotta→amber sphere with three orbiting rings and
 * a soft halo, recreated faithfully from the design. Pure CSS/animation (the
 * @keyframes live in globals.css); decorative and calm. Clicking it focuses the
 * ask bar — voice capture is not wired yet, so it makes no false claim to listen.
 */

const ringGroup = (
  outer: CSSProperties,
  spin: string,
  border: string,
  shadow: string,
  node: CSSProperties,
) => (
  <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', ...outer }}>
    <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', animation: spin }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: `2px solid ${border}`,
          boxShadow: shadow,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: -7,
          left: '50%',
          borderRadius: '50%',
          ...node,
        }}
      />
    </div>
  </div>
);

export function Orb({ onClick }: { onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label="Xanî"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick?.();
      }}
      style={{
        position: 'relative',
        width: 344,
        height: 330,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '6px 0 2px',
        cursor: 'pointer',
      }}
    >
      {/* halo */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 330,
          height: 330,
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 50% 50%, rgba(232,163,61,.32), rgba(192,97,58,.16) 46%, transparent 72%)',
          filter: 'blur(26px)',
          animation: 'orbHalo 6s ease-in-out infinite',
        }}
      />

      <div
        style={{
          position: 'relative',
          width: 256,
          height: 256,
          perspective: '1000px',
          animation: 'orbFloat 8s ease-in-out infinite',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transformStyle: 'preserve-3d',
            animation: 'orbScene 16s ease-in-out infinite',
          }}
        >
          {/* core */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: 150,
              height: 150,
              margin: '-75px 0 0 -75px',
              borderRadius: '50%',
              animation: 'orbCore 5.5s ease-in-out infinite',
              background:
                'radial-gradient(circle at 40% 36%, #FFFFFF 0%, #FFE7C4 14%, #F2B05E 42%, #C0613A 73%, #7E351F 100%)',
              boxShadow:
                '0 0 56px rgba(232,163,61,.55), inset -14px -16px 34px rgba(110,42,24,.6), inset 12px 12px 28px rgba(255,240,214,.7)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '15%',
                left: '21%',
                width: '34%',
                height: '26%',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(255,255,255,.85), rgba(255,255,255,0) 70%)',
                filter: 'blur(2px)',
              }}
            />
          </div>

          {ringGroup(
            { transform: 'rotateX(72deg) rotateY(6deg)' },
            'orbZ 9s linear infinite',
            'rgba(192,97,58,.55)',
            '0 0 14px rgba(192,97,58,.5), inset 0 0 14px rgba(192,97,58,.3)',
            {
              width: 13,
              height: 13,
              marginLeft: -6.5,
              background: 'radial-gradient(circle at 40% 40%, #FFFFFF, #F2B05E 55%, #C0613A)',
              boxShadow: '0 0 16px 3px rgba(232,163,61,.85)',
            },
          )}
          {ringGroup(
            { transform: 'rotateX(66deg) rotateY(62deg)' },
            'orbZr 12s linear infinite',
            'rgba(232,163,61,.55)',
            '0 0 14px rgba(232,163,61,.5), inset 0 0 14px rgba(232,163,61,.3)',
            {
              width: 12,
              height: 12,
              marginLeft: -6,
              background: 'radial-gradient(circle at 40% 40%, #FFFFFF, #FFD089 55%, #E8A33D)',
              boxShadow: '0 0 16px 3px rgba(232,163,61,.85)',
            },
          )}
          {ringGroup(
            { transform: 'rotateX(80deg) rotateY(-50deg)' },
            'orbZ 15s linear infinite',
            'rgba(217,138,90,.5)',
            '0 0 14px rgba(217,138,90,.45), inset 0 0 14px rgba(217,138,90,.28)',
            {
              width: 11,
              height: 11,
              marginLeft: -5.5,
              background: 'radial-gradient(circle at 40% 40%, #FFFFFF, #F4C79C 55%, #D98A5A)',
              boxShadow: '0 0 15px 3px rgba(217,138,90,.8)',
            },
          )}
        </div>
      </div>
    </div>
  );
}
