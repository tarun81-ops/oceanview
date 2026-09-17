import type { ProfileLevel } from '../data/types';

interface Props {
  series: ProfileLevel[];
  field: 'temp' | 'sal';
  color: string;
  unit: string;
  min: number;
  max: number;
}

const W = 260;
const H = 190;
const PAD = { left: 38, right: 12, top: 12, bottom: 24 };
const DEPTH_MAX = 2000;

/** Depth on the vertical axis, increasing downward, as oceanographers read it. */
export function ProfileChart({ series, field, color, unit, min, max }: Props) {
  const x = (v: number) => PAD.left + ((v - min) / (max - min)) * (W - PAD.left - PAD.right);
  const y = (d: number) => PAD.top + (d / DEPTH_MAX) * (H - PAD.top - PAD.bottom);

  const path = series
    .map((lvl, i) => `${i === 0 ? 'M' : 'L'}${x(lvl[field]).toFixed(1)},${y(lvl.depth).toFixed(1)}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${field} against depth`}>
      {[0, 500, 1000, 1500, 2000].map((d) => (
        <line
          key={d}
          x1={PAD.left}
          y1={y(d)}
          x2={W - PAD.right}
          y2={y(d)}
          stroke="#16303f"
          strokeWidth={0.6}
        />
      ))}
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} stroke="#24485c" />
      <line
        x1={PAD.left}
        y1={H - PAD.bottom}
        x2={W - PAD.right}
        y2={H - PAD.bottom}
        stroke="#24485c"
      />

      <path d={path} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      {series.map((lvl) => (
        <circle key={lvl.depth} cx={x(lvl[field])} cy={y(lvl.depth)} r={1.9} fill={color} />
      ))}

      <text className="ax" x={PAD.left} y={H - 6}>
        {min}
        {unit}
      </text>
      <text className="ax" x={W - PAD.right} y={H - 6} textAnchor="end">
        {max}
        {unit}
      </text>
      <text className="ax" x={PAD.left - 6} y={PAD.top + 8} textAnchor="end">
        0m
      </text>
      <text className="ax" x={PAD.left - 6} y={H - PAD.bottom} textAnchor="end">
        2000m
      </text>
    </svg>
  );
}
