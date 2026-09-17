import { forwardRef } from 'react';
import { Canvas } from '@react-three/fiber';
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
}

export const Scene = forwardRef<OrbitControlsImpl, Props>(function Scene(
  { profiles, selectedId, hoveredId, onSelect, onHover, onClearSelection },
  controlsRef,
) {
  const reducedMotion = useReducedMotion();

  return (
    <Canvas
      camera={{ position: [11, 7, 13], fov: 45, near: 0.1, far: 200 }}
      dpr={[1, 2]}
      onPointerMissed={onClearSelection}
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
    </Canvas>
  );
});
