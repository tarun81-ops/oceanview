# oceanview

Argo Float Explorer — a 3D visualisation of Indian Ocean Argo float profiles.

The runnable Vite application lives in **[`argo-float-explorer/`](./argo-float-explorer)**.
That folder is the application root: `package.json`, `package-lock.json`, `index.html`,
`vite.config.ts`, the TypeScript configs and `src/` all live there. There is no application
code at the repository root.

## Run it

```bash
cd argo-float-explorer
npm install
npm run dev        # http://localhost:5173
```

Build and preview the production bundle:

```bash
cd argo-float-explorer
npm run build
npm run preview    # http://localhost:4173
```

The app loads real Argo profiles by default from
`argo-float-explorer/public/data/profiles.json`. Regenerate that file from raw
NetCDF inputs in `argo-float-explorer/data/raw/` (git-ignored) with
`python scripts/convert_netcdf.py` — see the "Real Argo data" section of
[`argo-float-explorer/README.md`](./argo-float-explorer/README.md) for Windows
and Linux/macOS instructions.

Full documentation, project layout and deployment notes:
[`argo-float-explorer/README.md`](./argo-float-explorer/README.md).
