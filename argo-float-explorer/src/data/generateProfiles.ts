import type { Profile, ProfileLevel } from './types';
import { BOUNDS } from './types';

/** Argo standard pressure levels, shallow-weighted like real profiles. */
const STANDARD_DEPTHS = [
  0, 10, 20, 30, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 700, 1000, 1300, 1600, 2000,
];

/** Deterministic PRNG so the mock dataset is stable across reloads. */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/**
 * Tropical Indian Ocean structure: near-isothermal mixed layer, sharp
 * thermocline between ~50-300 m, slow decline to ~2.3 C at 2000 m.
 */
function tempAtDepth(depth: number, surfaceTemp: number): number {
  if (depth <= 50) return surfaceTemp - depth * 0.02;
  if (depth <= 300) {
    const top = surfaceTemp - 1;
    const bottom = 8;
    const f = (depth - 50) / 250;
    return top + (bottom - top) * Math.pow(f, 0.7);
  }
  const f = Math.min(1, (depth - 300) / 1700);
  return 8 - (8 - 2.3) * Math.pow(f, 0.6);
}

/** Subsurface salinity maximum near 150 m, freshening with depth. */
function salAtDepth(depth: number, jitter: number): number {
  const base = 35.0 + 0.55 * Math.sin(depth / 280);
  return base + jitter * 0.3;
}

/**
 * MOCK DATA BOUNDARY.
 * Returns synthetic profiles shaped exactly like the future API payload.
 * Replace the call site (see profileSource.ts) with fetch('/api/profiles')
 * once the backend exists - nothing downstream changes.
 */
export function generateProfiles(count = 60): Profile[] {
  const rnd = seededRandom(42);
  const profiles: Profile[] = [];

  for (let i = 0; i < count; i += 1) {
    const lat = BOUNDS.latMin + rnd() * (BOUNDS.latMax - BOUNDS.latMin);
    const lon = BOUNDS.lonMin + rnd() * (BOUNDS.lonMax - BOUNDS.lonMin);
    const month = 1 + Math.floor(rnd() * 12);
    const surfaceTemp = 25 + (1 - Math.abs(lat) / 30) * 5 + (rnd() - 0.5) * 1.5;

    const series: ProfileLevel[] = STANDARD_DEPTHS.map((depth) => ({
      depth,
      temp: Number((tempAtDepth(depth, surfaceTemp) + (rnd() - 0.5) * 0.3).toFixed(2)),
      sal: Number(salAtDepth(depth, rnd() - 0.5).toFixed(2)),
    }));

    profiles.push({
      // Sequential stride + small jitter: unique by construction. A purely random
      // id collides (Birthday problem), and duplicate ids broke selection, panel
      // lookups and React keys.
      id: `WMO${2900000 + i * 173 + Math.floor(rnd() * 100)}`,
      lat: Number(lat.toFixed(2)),
      lon: Number(lon.toFixed(2)),
      month,
      surfaceTemp: Number(surfaceTemp.toFixed(2)),
      series,
    });
  }

  return profiles;
}
