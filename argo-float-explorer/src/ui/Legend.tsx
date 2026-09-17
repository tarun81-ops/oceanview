import { TEMP_MAX, TEMP_MIN, temperatureRampCss } from '../lib/color';

/**
 * Temperature key only: depth is read from the ruler drawn inside the 3D volume,
 * so it is not duplicated here.
 */
export function Legend() {
  return (
    <figure className="legend">
      <figcaption className="legend__title">Surface temperature</figcaption>
      <div
        className="legend__ramp"
        style={{ background: temperatureRampCss() }}
        role="img"
        aria-label={`Colour scale from ${TEMP_MIN} to ${TEMP_MAX} degrees Celsius, cool blue through warm coral`}
      />
      <div className="legend__scale">
        <span>{TEMP_MIN} °C</span>
        <span>{TEMP_MAX} °C</span>
      </div>
    </figure>
  );
}
