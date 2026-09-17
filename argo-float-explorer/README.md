# Argo Float Explorer

Interactive 3D visualisation of Indian Ocean Argo float profiles, built with Vite, React,
TypeScript, React Three Fiber and Drei. The app is entirely static and self-contained — no
backend, no NetCDF processing, no external data or font download. Profiles are synthetic
and generated in the browser.

## Requirements

Node 20 or newer (`.nvmrc` pins 20). Check with `node -v`.

## Commands

Run every command from this folder (`argo-float-explorer/`) — it is the only application
root in the repository:

```bash
cd argo-float-explorer

npm install        # install dependencies (use npm ci in CI)
npm run dev        # dev server at http://localhost:5173
npm run build      # type-check, then emit the static bundle to dist/
npm run preview    # serve the built bundle at http://localhost:4173
npm run typecheck  # tsc -b, no output written
```

`npm run dev` binds to `0.0.0.0` so it also works inside containers and sandboxes; the
first compile takes a second, after which the page reloads on save.

Building for a sub-path (GitHub Pages style):

```bash
VITE_BASE_PATH=/argo-float-explorer/ npm run build && npm run preview
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
.
├── index.html            # shell: boot fallback for a failed bundle load
├── vite.config.ts        # dev/preview server, base path, chunk splitting
├── tsconfig.json         # app project (src/) + reference to the node project
├── tsconfig.node.json    # type-checks vite.config.ts in build mode
└── src/
    ├── main.tsx          # React entry, wraps the app in the error boundary
    ├── App.tsx           # state, data loading, scene watchdog, layout
    ├── index.css         # bundled IBM Plex fonts + all styling
    ├── data/             # profile types, mock generator, single data boundary
    ├── lib/              # colour ramp, scene projection, WebGL detection, motion
    ├── scene/            # R3F canvas, ocean volume with depth ruler, float markers
    └── ui/               # toolbar, legend, profile panel, charts, status screens
```

## Failure states (never a blank page)

The page always explains itself instead of showing nothing:

| Failure | What you see |
| --- | --- |
| JavaScript bundle fails to load or throws before React mounts | "Argo Float Explorer failed to start" from the inline fallback in `index.html` |
| WebGL is unavailable (old browser, disabled hardware acceleration) | "3D view unavailable" status screen |
| WebGL context is created but never draws a frame | "The 3D view stopped responding" after a 6 s watchdog, with a retry that rebuilds the canvas |
| GPU drops the context (driver reset) | Same status screen; the canvas is recreated on retry |
| Any uncaught React error | Error boundary reports the message with a retry button |
| Profile data fails to load | "Profiles could not be loaded" with a retry button |

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
metres increasing downward, `temp` in °C and `sal` in psu. Ids must be unique — selection,
panel lookup and React keys are all keyed on `id`. Failures surface as the retry screen
automatically. If the API lives on another origin, set a proxy in `vite.config.ts` for
development and enable CORS in production.

## Deployment

`npm run build` emits a fully static bundle in `dist/` with no server dependency.

**GitHub Pages** — `.github/workflows/deploy.yml` (repository root) installs and builds in
`argo-float-explorer/`, then publishes `argo-float-explorer/dist`. Enable it once under
Settings → Pages → Build and deployment → Source → *GitHub Actions*. The workflow passes
`VITE_BASE_PATH=/<repo>/` so asset URLs resolve under the repository sub-path. It installs
with `npm ci`, so commit `package-lock.json` after changing dependencies.

**Vercel / Netlify** — set the project root (or "base directory") to `argo-float-explorer`,
build command `npm run build`, output directory `dist`. Leave `VITE_BASE_PATH` unset; the
site is served from the domain root.
