import { BOUNDS } from '../data/types';

/** World-space size of the ocean volume, in scene units. */
export const VOLUME = { width: 12, depth: 12, height: 7 } as const;

/** Longitude -> scene X. */
export function lonToX(lon: number): number {
  const f = (lon - BOUNDS.lonMin) / (BOUNDS.lonMax - BOUNDS.lonMin);
  return (f - 0.5) * VOLUME.width;
}

/** Latitude -> scene Z (north toward negative Z so the map reads naturally). */
export function latToZ(lat: number): number {
  const f = (lat - BOUNDS.latMin) / (BOUNDS.latMax - BOUNDS.latMin);
  return -(f - 0.5) * VOLUME.depth;
}

/** Depth in metres -> scene Y (surface at 0, deepest at -height). */
export function depthToY(depth: number): number {
  return -(depth / BOUNDS.depthMax) * VOLUME.height;
}
