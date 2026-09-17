import { useMemo, useRef } from 'react';
import { Html, Line } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { Profile } from '../data/types';
import { temperatureColor, temperatureCss } from '../lib/color';
import { depthToY, latToZ, lonToX } from '../lib/projection';

/** Pointer travel (px) above which a press counts as an orbit drag, not a click. */
const DRAG_THRESHOLD = 5;

interface Props {
  profiles: Profile[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (profile: Profile) => void;
  onHover: (profile: Profile | null) => void;
}

function MarkerTooltip({ profile }: { profile: Profile }) {
  return (
    <Html
      center
      distanceFactor={12}
      zIndexRange={[20, 10]}
      style={{ pointerEvents: 'none' }}
      position={[0, 0.45, 0]}
    >
      <div className="tooltip" role="presentation">
        <span className="tooltip__id">{profile.id}</span>
        <span className="tooltip__row">
          <em style={{ color: temperatureCss(profile.surfaceTemp) }}>
            {profile.surfaceTemp.toFixed(1)} °C
          </em>
          surface
        </span>
        <span className="tooltip__row">
          {profile.lat.toFixed(2)}° , {profile.lon.toFixed(2)}°
        </span>
      </div>
    </Html>
  );
}

function FloatMarker({
  profile,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  profile: Profile;
  selected: boolean;
  hovered: boolean;
  onSelect: (p: Profile) => void;
  onHover: (p: Profile | null) => void;
}) {
  const x = lonToX(profile.lon);
  const z = latToZ(profile.lat);
  const color = useMemo(() => temperatureColor(profile.surfaceTemp), [profile.surfaceTemp]);
  const pressAt = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    pressAt.current = { x: e.clientX, y: e.clientY };
  };

  /** Only select when the pointer barely moved: an orbit drag must not select. */
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    const start = pressAt.current;
    pressAt.current = null;
    if (start) {
      const travel = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (travel > DRAG_THRESHOLD) return;
    }
    e.stopPropagation();
    onSelect(profile);
  };

  return (
    <group>
      <mesh
        position={[x, 0, z]}
        scale={selected ? 1.9 : hovered ? 1.45 : 1}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(profile);
        }}
        onPointerOut={() => onHover(null)}
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

      {hovered && (
        <group position={[x, 0, z]}>
          <MarkerTooltip profile={profile} />
        </group>
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

export function FloatMarkers({ profiles, selectedId, hoveredId, onSelect, onHover }: Props) {
  return (
    <group>
      {profiles.map((p) => (
        <FloatMarker
          key={p.id}
          profile={p}
          selected={p.id === selectedId}
          hovered={p.id === hoveredId}
          onSelect={onSelect}
          onHover={onHover}
        />
      ))}
    </group>
  );
}
