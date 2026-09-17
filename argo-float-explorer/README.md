# Argo Float Explorer

Interactive 3D visualisation of Indian Ocean Argo float profiles, built with Vite, React,
TypeScript, React Three Fiber and Drei. The app is entirely static — there is no backend,
no NetCDF processing and no external data download. Profiles are synthetic and generated
in the browser.

## Requirements

Node 20 or newer (`.nvmrc` pins 20). Check with `node -v`.

## Commands

```bash
npm install     # install dependencies
npm run dev     # development server at http://localhost:5173
npm run build   # type-check and emit the static bundle to dist/
npm run preview # serve the built bundle at http://localhost:4173
npm run typecheck
```

## Using the app

| Action | How |
| --- | --- |
| Rotate | drag |
| Pan | right-drag (two-finger drag on touch) |
| Zoom | scroll or pinch |
| Inspect a float | click a marker; hover shows a tooltip |
| Move between floats | arrow keys, or Previous/Next in the panel |
| Close the panel | Esc, the Close button, or click empty space |
| Reset the camera | Reset view |

## Project layout

```
src/
├── data/        profile types, mock generator, and the single data boundary
├── lib/         colour ramp, scene projection, WebGL detection, motion preference
├── scene/       R3F canvas, ocean volume with depth ruler, float markers
└── ui/          toolbar, legend, profile panel, charts, status screens
```

## Connecting a real backend

`src/data/profileSource.ts` is the only file that knows where data comes from. Replace the
body of `loadProfiles()` with a request and delete nothing else:

```ts
export async function loadProfiles(): Promise<Profile[]> {
  const res = await fetch('/api/profiles');
  if (!res.ok) throw new Error(`Profile request failed: ${res.status}`);
  return (await res.json()) as Profile[];
}
```

The endpoint must return a JSON array matching `Profile` in `src/data/types.ts`:
`{ id, lat, lon, month, surfaceTemp, series: [{ depth, temp, sal }] }`, with `depth` in
metres increasing downward, `temp` in °C and `sal` in psu. Failures surface as the retry
screen automatically, so throwing on a non-2xx response is the correct behaviour. If the
API lives on another origin, set a proxy in `vite.config.ts` for development and enable
CORS in production.

## Deployment

`npm run build` emits a fully static bundle in `dist/` with no server dependency.

**GitHub Pages** — `.github/workflows/deploy.yml` builds and publishes `dist/` on every push
to `main`. Enable it once under Settings → Pages → Build and deployment → Source →
*GitHub Actions*. The workflow passes `VITE_BASE_PATH=/<repo>/` so asset URLs resolve under
the repository subpath. It installs with `npm ci`, so commit `package-lock.json` after your
first `npm install`.

**Vercel** — import the repository, framework preset *Vite*, build `npm run build`, output
`dist`. No base path needed; the site is served from the domain root.

**Netlify** — build `npm run build`, publish directory `dist`. Same as above: leave
`VITE_BASE_PATH` unset.

To build locally for a subpath: `VITE_BASE_PATH=/argo-float-explorer/ npm run build`.
