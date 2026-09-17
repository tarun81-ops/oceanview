import type { Profile } from './types';
import { generateProfiles } from './generateProfiles';

/**
 * Single data boundary for the whole app.
 * Today: synthetic profiles. Tomorrow: swap the body for
 *   const res = await fetch('/api/profiles');
 *   return (await res.json()) as Profile[];
 * The response shape is identical, so no component needs editing.
 */
export async function loadProfiles(): Promise<Profile[]> {
  return generateProfiles(60);
}
