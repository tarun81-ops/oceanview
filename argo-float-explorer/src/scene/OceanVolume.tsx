import { useMemo } from 'react';
import { BoxGeometry, EdgesGeometry } from 'three';
import { depthToY, VOLUME } from '../lib/projection';

const GRID_DEPTHS = [0, 500, 1000, 1500, 2000];

/** Wireframe box plus horizontal depth planes marking the ocean volume. */
export function OceanVolume() {
  const edges = useMemo(
    () => new EdgesGeometry(new BoxGeometry(VOLUME.width, VOLUME.height, VOLUME.depth)),
    [],
  );

  return (
    <group>
      <lineSegments geometry={edges} position={[0, -VOLUME.height / 2, 0]}>
        <lineBasicMaterial color="#1f3a4d" />
      </lineSegments>

      {GRID_DEPTHS.map((d) => (
        <mesh key={d} rotation={[-Math.PI / 2, 0, 0]} position={[0, depthToY(d), 0]}>
          <planeGeometry args={[VOLUME.width, VOLUME.depth]} />
          <meshBasicMaterial
            color={d === 0 ? '#1c8f9c' : '#12455c'}
            transparent
            opacity={d === 0 ? 0.1 : 0.05}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
