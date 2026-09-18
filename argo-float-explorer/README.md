# Argo Float Explorer

Interactive 3D visualisation of Indian Ocean Argo float profiles, built with Vite, React,
TypeScript, React Three Fiber and Drei. The app is entirely static and self-contained — no
backend, no external data or font download at runtime.

By default it loads **real Argo profiles** from `public/data/profiles.json`, a static
export produced by the Python converter in `scripts/convert_netcdf.py` from raw Argo
NetCDF files placed in `data/raw/` (see [Real Argo data](#real-argo-data-netcdf--json)
below). The in-browser synthetic generator is kept only as an optional development
fallback (`?mock` in the URL or `VITE_USE_MOCK=1`, dev builds only).

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

## Real Argo data (NetCDF → JSON)

The default dataset is real Argo data. Raw NetCDF profile files are dropped into
`data/raw/` (any sub-folder layout works, `*.nc` is scanned recursively). The raw
files are **local-only input**: they are git-ignored, never modified, never uploaded
and never loaded by the browser — the converter runs in Python and writes the
static `public/data/profiles.json` that the app fetches.

### Windows

Run everything from this folder (`argo-float-explorer\`) in PowerShell:

```powershell
# 1. Create and activate a Python virtual environment (needs Python 3.10+)
py -3 -m venv .venv
.venv\Scripts\Activate.ps1
# (if script execution is restricted:  Set-ExecutionPolicy -Scope Process Bypass)

# 2. Install the data-pipeline dependencies
pip install -r requirements-data.txt

# 3. Put your Argo *.nc files under data.raw\ (e.g. data.raw\2019-01\float123_prof.nc)

# 4. Convert them (inspect the inputs first if you like)
python scripts\convert_netcdf.py --inspect
python scripts\convert_netcdf.py

# 5. Start the frontend
npm install        # first time only
npm run dev        # dev server at http://localhost:5173

# 6. Build the production bundle
npm run build
```

Linux/macOS equivalents: `python3 -m venv .venv && source .venv/bin/activate`,
`pip install -r requirements-data.txt`, `python scripts/convert_netcdf.py`.

The converter:

- auto-detects Argo 3.x DAC profile files (multi-profile `_prof.nc` files and
  single-profile `profiles/R*.nc` files), plus generic 2-D `(time, pres)`
  collections and legacy 1-D single-profile files;
- gracefully skips non-profile files (`*_meta.nc`, `*_Rtraj.nc`, `*_tech.nc`);
- prefers `TEMP_ADJUSTED` / `PSAL_ADJUSTED` / `PRES_ADJUSTED` per level, falling
  back to `TEMP` / `PSAL` / `PRES` where the adjusted value is a fill value, and
  applies the matching QC flags (only QC `1` or `2` kept, for temperature,
  salinity, position and date);
- converts pressure to approximate positive-downward depth in metres
  (`depth ≈ 0.9931 × pressure(dbar)`, constant-density approximation, <1 % to
  2000 m; a `DEPTH` variable is used as-is when present);
- skips profiles with invalid positions/dates, outside the visualised Indian
  Ocean box (lon 40–100, lat −30–25), outside the target year (default 2019,
  `--year all` to disable), or with no valid levels after QC filtering;
- writes unique IDs (`<platform>-<cycle>[-<profile index>]`), sorts each series
  by ascending depth, sets `month` from the actual observation date and
  `surfaceTemp` from the shallowest valid temperature;
- validates the result (exists, valid JSON, ≥1 profile, full schema check) and
  prints a report with files scanned, profiles exported, profiles skipped and
  reasons. If the output exceeds 25 MB it warns that a backend/API will be
  needed before deploying the full archive as a static site.

Useful options: `--raw-dir`, `--out`, `--year`, `--lat-min/--lat-max`,
`--lon-min/--lon-max`, `--depth-max`, `--inspect`.

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

`src/data/profileSource.ts` is the only file that knows where data comes from. It currently
loads the static export `fetch('/data/profiles.json')` (regenerated by
`python scripts/convert_netcdf.py`). When a real API exists — needed once the archive outgrows
the ~25 MB static budget — replace the body of `loadProfiles()` with a request and delete
nothing else:

```ts
export async function loadProfiles(): Promise<Profile[]> {
  const res = await fetch('/api/profiles');
  if (!res.ok) throw new Error(`Profile request failed: ${res.status}`);
  return (await res.json()) as Profile[];
}
```

The mock generator in `src/data/generateProfiles.ts` remains as an optional development
fallback only: in dev builds, append `?mock` to the URL or set `VITE_USE_MOCK=1`. The
production build always uses the real source.

The endpoint (or the JSON file) must return a JSON array matching `Profile` in `src/data/types.ts`:
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
