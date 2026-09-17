import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import type { Profile } from '../data/types';
import { temperatureColor } from '../lib/color';
import { depthToY, latToZ, lonToX } from '../lib/projection';

interface Props {
  profiles: Profile[];
  selectedId: string | null;
  onSelect: (profile: Profile) => void;
}

function FloatMarker({
  profile,
  selected,
  onSelect,
}: {
  profile: Profile;
  selected: boolean;
  onSelect: (p: Profile) => void;
}) {
  const x = lonToX(profile.lon);
  const z = latToZ(profile.lat);
  const color = useMemo(() => temperatureColor(profile.surfaceTemp), [profile.surfaceTemp]);

  return (
    <group>
      <mesh
        position={[x, 0, z]}
        scale={selected ? 1.9 : 1}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(profile);
        }}
        onPointerOver={() => {
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'default';
        }}
      >
        <sphereGeometry args={[0.1, 18, 18]} />
        <meshBasicMaterial color={color} />
      </mesh>

      {selected && (
        <mesh position={[x, 0, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.26, 0.32, 32]} />
          <meshBasicMaterial color="#3fc8d4" transparent opacity={0.9} />
        </mesh>
      )}

      <Line
        points={[
          [x, 0, z],
          [x, depthToY(2000), z],
        ]}
        color={selected ? '#3fc8d4' : '#1f3a4d'}
        lineWidth={selected ? 1.6 : 0.8}
        transparent
        opacity={selected ? 0.9 : 0.55}
      />
    </group>
  );
}

export function FloatMarkers({ profiles, selectedId, onSelect }: Props) {
  return (
    <group>
      {profiles.map((p) => (
        <FloatMarker
          key={p.id + p.month}
          profile={p}
          selected={p.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}
