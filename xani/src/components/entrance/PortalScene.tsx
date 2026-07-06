'use client';

import { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * The 3D portal — a luminous ivory-and-gold corridor the camera flies through and into a
 * bright gateway, matching the storyboard's warm palette (NOT a dark space tunnel). Pure
 * WebGL via React Three Fiber. Timed by the shared clock so it lands exactly as the overlay
 * dissolves to Home. Deliberately light-weight for a MacBook Air: unlit (basic) materials,
 * a handful of rings, instanced motes, warm fog — no lights, no post-processing.
 */

const DURATION = 4.6; // seconds — matches the overlay arc

/** A warm radial-gradient sprite texture for the gateway light + motes. */
function useGlowTexture() {
  return useMemo(() => {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,248,230,1)');
    g.addColorStop(0.35, 'rgba(233,201,140,0.8)');
    g.addColorStop(1, 'rgba(233,201,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
}

const RING_COUNT = 16;
const RING_GAP = 1.6;

function Corridor() {
  const group = useRef<THREE.Group>(null);
  const portal = useRef<THREE.Sprite>(null);
  const { camera } = useThree();
  const glow = useGlowTexture();
  const start = useRef<number | null>(null);

  const rings = useMemo(
    () => Array.from({ length: RING_COUNT }, (_, i) => ({ z: -i * RING_GAP, spin: (i % 2 ? 1 : -1) * (0.1 + Math.random() * 0.1), r: 3 })),
    [],
  );

  useFrame((state) => {
    if (start.current === null) start.current = state.clock.elapsedTime;
    const t = Math.min(1, (state.clock.elapsedTime - start.current) / DURATION);
    // Ease-in-out fly toward the gateway.
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    camera.position.z = 9 - ease * 22; // 9 → -13, flying through the rings toward the portal at -24
    camera.position.x = Math.sin(state.clock.elapsedTime * 0.4) * 0.35;
    camera.position.y = Math.cos(state.clock.elapsedTime * 0.3) * 0.25;
    camera.lookAt(0, 0, -30);
    if (group.current) {
      group.current.children.forEach((ring, i) => {
        ring.rotation.z += rings[i]!.spin * 0.01;
      });
    }
    if (portal.current) {
      const s = 6 + ease * 26; // gateway blooms as we approach
      portal.current.scale.set(s, s, 1);
      (portal.current.material as THREE.SpriteMaterial).opacity = 0.6 + ease * 0.4;
    }
  });

  return (
    <>
      <fog attach="fog" args={['#efe6d4', 5, 22]} />
      <group ref={group}>
        {rings.map((ring, i) => (
          <mesh key={i} position={[0, 0, ring.z]}>
            <torusGeometry args={[ring.r, 0.05 + (i % 3 === 0 ? 0.03 : 0), 8, 64]} />
            <meshBasicMaterial color={i % 3 === 0 ? '#d8b878' : '#c9a76b'} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        ))}
      </group>
      {/* the gateway light at the end of the corridor */}
      <sprite ref={portal} position={[0, 0, -24]}>
        <spriteMaterial map={glow} transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <Motes glow={glow} />
    </>
  );
}

function Motes({ glow }: { glow: THREE.Texture }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const N = 130;
  const seed = useMemo(
    () => Array.from({ length: N }, () => ({
      x: (Math.random() - 0.5) * 10, y: (Math.random() - 0.5) * 8, z: -Math.random() * 24,
      s: 0.03 + Math.random() * 0.09, drift: 0.2 + Math.random() * 0.5, ph: Math.random() * Math.PI * 2,
    })),
    [],
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    seed.forEach((p, i) => {
      dummy.position.set(p.x + Math.sin(t * p.drift + p.ph) * 0.3, p.y + Math.cos(t * p.drift + p.ph) * 0.3, p.z);
      const s = p.s * (0.7 + 0.3 * Math.sin(t * 2 + p.ph));
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={glow} transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} />
    </instancedMesh>
  );
}

export default function PortalScene() {
  return (
    <Canvas
      className="xj-canvas3d"
      camera={{ position: [0, 0, 9], fov: 62, near: 0.1, far: 60 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => gl.setClearColor('#f2ece0', 1)}
      frameloop="always"
    >
      <Corridor />
    </Canvas>
  );
}
