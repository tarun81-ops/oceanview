import type { ProfileLevel } from '../data/types';

interface Props {
  series: ProfileLevel[];
  field: 'temp' | 'sal';
  color: string;
  axisLabel: string;
  min: number;
  max: number;
  ticks: number[];
}

const W = 280;
const H = 210;
const PAD = { left: 46, right: 14, top: 14, bottom: 42 };
const DEPTH_MAX = 2000;
const DEPTH_TICKS = [0, 500, 1000, 1500, 2000];

/** Depth runs down the vertical axis, as oceanographers read a profile. */
export function ProfileChart({ series, field, color, axisLabel, min, max, ticks }: Props) {
  const x = (v: number) => PAD.left + ((v - min) / (max - min)) * (W - PAD.left - PAD.right);
  const y = (d: number) => PAD.top + (d / DEPTH_MAX) * (H - PAD.top - PAD.bottom);

  const path = series
    .map((lvl, i) => `${i === 0 ? 'M' : 'L'}${x(lvl[field]).toFixed(1)},${y(lvl.depth).toFixed(1)}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${axisLabel} against depth in metres`}>
      {DEPTH_TICKS.map((d) => (
        <g key={d}>
          <line x1={PAD.left} y1={y(d)} x2={W - PAD.right} y2={y(d)} stroke="#16303f" strokeWidth={0.6} />
          <text className="ax" x={PAD.left - 7} y={y(d) + 3} textAnchor="end">
            {d}
          </text>
        </g>
      ))}

      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} y1={PAD.top} x2={x(t)} y2={H - PAD.bottom} stroke="#16303f" strokeWidth={0.5} />
          <text className="ax" x={x(t)} y={H - PAD.bottom + 13} textAnchor="middle">
            {t}
          </text>
        </g>
      ))}

      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} stroke="#24485c" />
      <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} stroke="#24485c" />

      <path d={path} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      {series.map((lvl) => (
        <circle key={lvl.depth} cx={x(lvl[field])} cy={y(lvl.depth)} r={1.9} fill={color} />
      ))}

      <text className="ax ax--title" x={(W + PAD.left) / 2} y={H - 6} textAnchor="middle">
        {axisLabel}
      </text>
      <text className="ax ax--title" x={12} y={(H - PAD.bottom + PAD.top) / 2} textAnchor="middle"
        transform={`rotate(-90 12 ${(H - PAD.bottom + PAD.top) / 2})`}>
        Depth (m)
      </text>
    </svg>
  );
}
