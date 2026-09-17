export interface ProfileLevel {
  depth: number; // metres, positive downward
  temp: number;  // degrees Celsius
  sal: number;   // practical salinity units
}

export interface Profile {
  id: string;
  lat: number;
  lon: number;
  month: number; // 1-12, all 2019
  surfaceTemp: number;
  series: ProfileLevel[];
}

/** Geographic + depth extent of the visualised volume. */
export const BOUNDS = {
  latMin: -30,
  latMax: 25,
  lonMin: 40,
  lonMax: 100,
  depthMax: 2000,
} as const;
