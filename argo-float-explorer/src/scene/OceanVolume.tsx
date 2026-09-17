import { useEffect, useMemo } from 'react';
import { Html, Line } from '@react-three/drei';
import { BoxGeometry, EdgesGeometry } from 'three';
import { depthToY, VOLUME } from '../lib/projection';

const DEPTH_TICKS = [0, 500, 1000, 1500, 2000];
const RULER_X = -VOLUME.width / 2;
const RULER_Z = VOLUME.depth / 2;

/**
 * Wireframe box, faint depth planes, and a depth ruler pinned to the front-left
 * edge of the volume so the labels stay aligned with the 3D scene as it orbits.
 */
export function OceanVolume() {
  const edges = useMemo(() => {
    const box = new BoxGeometry(VOLUME.width, VOLUME.height, VOLUME.depth);
    const geometry = new EdgesGeometry(box);
    // EdgesGeometry copies what it needs; the source box would otherwise leak a
    // GPU buffer for the lifetime of the page.
    box.dispose();
    return geometry;
  }, []);

  useEffect(() => () => edges.dispose(), [edges]);

  return (
    <group>
      <lineSegments geometry={edges} position={[0, -VOLUME.height / 2, 0]}>
        <lineBasicMaterial color="#1f3a4d" />
      </lineSegments>

      {DEPTH_TICKS.map((d) => (
        <mesh key={`plane-${d}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, depthToY(d), 0]}>
          <planeGeometry args={[VOLUME.width, VOLUME.depth]} />
          <meshBasicMaterial
            color={d === 0 ? '#1c8f9c' : '#12455c'}
            transparent
            opacity={d === 0 ? 0.1 : 0.05}
            depthWrite={false}
          />
        </mesh>
      ))}

      <Line
        points={[
          [RULER_X, 0, RULER_Z],
          [RULER_X, depthToY(2000), RULER_Z],
        ]}
        color="#24485c"
        lineWidth={1}
      />

      {DEPTH_TICKS.map((d) => (
        <group key={`tick-${d}`} position={[RULER_X, depthToY(d), RULER_Z]}>
          <Line
            points={[
              [0, 0, 0],
              [-0.35, 0, 0],
            ]}
            color="#24485c"
            lineWidth={1}
          />
          <Html
            center
            distanceFactor={14}
            zIndexRange={[5, 1]}
            style={{ pointerEvents: 'none' }}
            position={[-1.1, 0, 0]}
          >
            <span className="depth-tick">{d} m</span>
          </Html>
        </group>
      ))}
    </group>
  );
}
