import { Color } from 'three';

const COLD = new Color('#3e7cb8');
const MID = new Color('#5f8a8c');
const WARM = new Color('#e8825a');

export const TEMP_MIN = 24;
export const TEMP_MAX = 30;

/** Maps a surface temperature onto the cool-blue to warm-coral ramp. */
export function temperatureColor(temp: number): Color {
  const f = Math.min(1, Math.max(0, (temp - TEMP_MIN) / (TEMP_MAX - TEMP_MIN)));
  const out = new Color();
  if (f < 0.5) out.lerpColors(COLD, MID, f / 0.5);
  else out.lerpColors(MID, WARM, (f - 0.5) / 0.5);
  return out;
}

export function temperatureCss(temp: number): string {
  return `#${temperatureColor(temp).getHexString()}`;
}
