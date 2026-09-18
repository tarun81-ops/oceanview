import { generateProfiles } from './generateProfiles';
import type { Profile } from './types';

/**
 * Data boundary for the whole app - the only file that knows where data
 * comes from.
 *
 * Default: real Argo profiles exported to /data/profiles.json by
 * `python scripts/convert_netcdf.py` (see README, "Real Argo data").
 *
 * Optional development fallback: the in-browser mock generator, enabled
 * only in a development build via the `?mock` query param or
 * `VITE_USE_MOCK=1`. The production build always loads the real data.
 */
export async function loadProfiles(): Promise<Profile[]> {
  if (useMockData()) return generateProfiles();

  const response = await fetch('/data/profiles.json');
  if (!response.ok) throw new Error('Could not load profile data');
  return response.json();
}

function useMockData(): boolean {
  if (!import.meta.env.DEV) return false;
  if (import.meta.env.VITE_USE_MOCK === '1') return true;
  try {
    return new URLSearchParams(window.location.search).get('mock') === '1';
  } catch {
    return false;
  }
}
