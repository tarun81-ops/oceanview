import { forwardRef, useCallback, useEffect, useRef } from 'react';
import { Canvas, useFrame, type RootState } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Profile } from '../data/types';
import { useReducedMotion } from '../lib/useReducedMotion';
import { OceanVolume } from './OceanVolume';
import { FloatMarkers } from './FloatMarkers';

interface Props {
  profiles: Profile[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (profile: Profile) => void;
  onHover: (profile: Profile | null) => void;
  onClearSelection: () => void;
  /** Fires once the first frame has actually been drawn. */
  onReady: () => void;
  /** Fires when the GPU drops the WebGL context, e.g. driver reset. */
  onContextLost: () => void;
}

/** Signals the parent after the first rendered frame, not merely on mount. */
function FrameSignal({ onReady }: { onReady: () => void }) {
  const done = useRef(false);

  useFrame(() => {
    if (done.current) return;
    done.current = true;
    onReady();
  });

  return null;
}

export const Scene = forwardRef<OrbitControlsImpl, Props>(function Scene(
  {
    profiles,
    selectedId,
    hoveredId,
    onSelect,
    onHover,
    onClearSelection,
    onReady,
    onContextLost,
  },
  controlsRef,
) {
  const reducedMotion = useReducedMotion();
  const detach = useRef<(() => void) | null>(null);

  const handleCreated = useCallback(
    ({ gl }: RootState) => {
      const canvas = gl.domElement;

      const onLost = (event: Event) => {
        // Without preventDefault the context is never restored, and the canvas
        // would stay blank forever.
        event.preventDefault();
        onContextLost();
      };

      canvas.addEventListener('webglcontextlost', onLost);
      detach.current = () => canvas.removeEventListener('webglcontextlost', onLost);
    },
    [onContextLost],
  );

  useEffect(() => () => detach.current?.(), []);

  return (
    <Canvas
      camera={{ position: [11, 7, 13], fov: 45, near: 0.1, far: 200 }}
      dpr={[1, 2]}
      // Software renderers (VMs, some remote desktops) are slow but valid: never
      // refuse a context just because the GPU is not hardware accelerated.
      gl={{ antialias: true, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false }}
      onCreated={handleCreated}
      onPointerMissed={onClearSelection}
      // Canvas fallback content: only ever displayed by a browser that cannot
      // create a canvas element at all.
      fallback={<p className="canvas-fallback">This browser cannot create a canvas element.</p>}
    >
      <ambientLight intensity={0.8} />
      <OceanVolume />
      <FloatMarkers
        profiles={profiles}
        selectedId={selectedId}
        hoveredId={hoveredId}
        onSelect={onSelect}
        onHover={onHover}
      />
      <OrbitControls
        ref={controlsRef}
        enablePan
        enableDamping={!reducedMotion}
        dampingFactor={0.08}
        minDistance={6}
        maxDistance={40}
        target={[0, -2, 0]}
        makeDefault
      />
      <FrameSignal onReady={onReady} />
    </Canvas>
  );
});
