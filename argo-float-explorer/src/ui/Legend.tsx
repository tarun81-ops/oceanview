import { TEMP_MAX, TEMP_MIN, temperatureCss } from '../lib/color';

const DEPTH_TICKS = [0, 500, 1000, 1500, 2000];

export function Legend() {
  const ramp = `linear-gradient(90deg, ${temperatureCss(TEMP_MIN)}, ${temperatureCss(
    (TEMP_MIN + TEMP_MAX) / 2,
  )}, ${temperatureCss(TEMP_MAX)})`;

  return (
    <div className="legend">
      <p className="legend__title">Surface temperature</p>
      <div className="legend__ramp" style={{ background: ramp }} />
      <div className="legend__scale">
        <span>{TEMP_MIN}°C</span>
        <span>{TEMP_MAX}°C</span>
      </div>

      <p className="legend__title legend__title--spaced">Depth</p>
      <ul className="legend__depths">
        {DEPTH_TICKS.map((d) => (
          <li key={d}>{d} m</li>
        ))}
      </ul>
    </div>
  );
}
