#!/usr/bin/env python3
"""Convert real Argo NetCDF profile files into the static JSON dataset
consumed by the argo-float-explorer 3D visualisation.

The script reads every ``*.nc`` file under ``data/raw/`` (recursively) with
xarray / netCDF4 / NumPy, extracts valid Argo profiles, and writes
``public/data/profiles.json`` matching the frontend contract:

    [
      {
        "id": "2902269-13",
        "lat": 15.83,
        "lon": 63.42,
        "month": 2,            # 1-12, from the actual observation date
        "surfaceTemp": 27.91,  # shallowest valid temperature
        "series": [ {"depth": 1.0, "temp": 27.91, "sal": 35.20}, ... ]
      },
      ...
    ]

Supported layouts (auto-detected per file):
  * Argo 3.x "trajectoryProfile" files (DAC distribution format):
    2-D variables over (N_PROF, N_LEVELS), per-profile scalars
    PLATFORM_NUMBER / CYCLE_NUMBER / JULD / LATITUDE / LONGITUDE /
    POSITION_QC / JULD_QC. Multi-profile files and single-profile
    ``profiles/R*.nc`` files (N_PROF = 1) are both handled.
  * Generic 2-D profile collections where the per-profile metadata
    (TIME / LATITUDE / LONGITUDE / PLATFORM) are not aligned on the first
    profile dimension (e.g. IFREMER "Argo 0000"-style files).
  * Legacy 1-D single-profile files (scalar metadata, one profile per
    file).

Files without profile variables (``*_meta.nc``, ``*_Rtraj.nc``,
``*_tech.nc``, ...) are detected and skipped, not fatal.

Data rules
----------
* Extracts platform ID, cycle number, latitude, longitude, profile date,
  pressure, temperature and salinity.
* Prefers adjusted fields (TEMP_ADJUSTED, PSAL_ADJUSTED, PRES_ADJUSTED)
  per level: where an adjusted value is present it is used, and where it
  is a fill value the raw TEMP / PSAL / PRES value at that level is used
  (the adjusted arrays are optional per level in DAC files). This avoids
  truncating profiles whose adjustment only covers part of the water
  column.
* Applies the *matching* quality-control flags: the QC variable of the
  field actually used (TEMP_QC or TEMP_ADJUSTED_QC, ...), POSITION_QC
  (or LATITUDE_QC / LONGITUDE_QC / DQC) for position and JULD_QC / TIME_QC
  for the date. Only QC flags 1 ("good") or 2 ("good, adjusted") are kept.
  Levels whose QC flag is a fill value, NaN, 0, or any other code are
  dropped. Profiles whose position or date QC flag is not 1/2 are skipped.
  (If a given QC variable does not exist in a file, no QC filtering is
  possible for that aspect and the values pass through - this is reported
  in the inspection output.)
* Fill values (via the netCDF ``_FillValue`` / ``missing_value``
  attributes, e.g. 99999.0 for PRES/TEMP/PSAL, 999999.0 for JULD, blank
  for QC chars) and NaNs are ignored.
* Invalid positions (|lat| > 90, |lon| > 180) and invalid dates (before
  1970 or beyond 2035) are rejected.
* Depth: Argo DAC files carry pressure in decibars, not depth. Where no
  DEPTH variable exists, depth is approximated as
      depth[m] = pressure[dbar] * 100 / (g * rho0),  g = 9.80665 m/s2,
      rho0 = 1026.8 kg/m3,
  i.e. depth ~= 0.9931 * pressure(dbar), so pressure in dbar is a close
  proxy for depth in metres. This constant-density
  approximation assumes a uniform seawater density; it is accurate to well
  under 1 % over the 0-2000 m range used by this first visualisation (a
  full hydrostatic integration through each profile's own T/S would be
  used for scientific work). A DEPTH variable, when present, is used
  directly instead. Depths are positive downward, and only levels with
  0 <= depth <= --depth-max (default 2000 m, the view volume limit) are
  kept.
* Profiles outside the visualised Indian Ocean box (default lon 40..100,
  lat -30..25) are skipped.
* The target year defaults to 2019 (the app's month filter is a 2019
  calendar, and the supplied files are 2019 months); use --year all to
  disable the year filter.
* IDs are unique: "<platform>-<cycle>" with a numeric suffix
  ("-2", "-3", ...) when the same platform+cycle occurs more than once in
  one file (e.g. separate descent/ascent casts), and a further suffix if
  an ID already appeared in another file.
* Each profile's series is sorted by ascending depth. A profile with no
  valid (depth, temp, sal) levels after QC filtering is skipped rather
  than emitted as malformed JSON.

Usage
-----
    python scripts\convert_netcdf.py                # convert data/raw -> public/data/profiles.json
    python scripts\convert_netcdf.py --inspect      # only inspect and report on the .nc files
    python scripts\convert_netcdf.py --year all     # keep every year, not just 2019

Options: --raw-dir, --out, --year, --lat-min/--lat-max, --lon-min/--lon-max,
--depth-max, --inspect.

The raw .nc files are only ever opened read-only; this script never
modifies, uploads, or commits them (they are git-ignored).
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

import numpy as np
import xarray as xr
import netCDF4  # noqa: F401  (engine behind xarray; also used directly in --inspect)

try:
    import cftime
except ImportError:  # cftime ships with xarray, but stay explicit
    cftime = None

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RAW_DIR = PROJECT_ROOT / "data" / "raw"
DEFAULT_OUT = PROJECT_ROOT / "public" / "data" / "profiles.json"

# Visualised Indian Ocean box (mirrors BOUNDS in src/data/types.ts).
DEFAULT_REGION = {"lat_min": -30.0, "lat_max": 25.0, "lon_min": 40.0, "lon_max": 100.0}
DEFAULT_DEPTH_MAX = 2000.0
DEFAULT_YEAR = 2019
MAX_STATIC_MB = 25.0

# Constant-density pressure -> depth approximation (see module docstring).
GRAVITY = 9.80665          # m s-2
RHO0 = 1026.8              # kg m-3
PA_PER_DBAR = 10000.0      # 1 dbar = 10^4 Pa

VALID_QC_FLAGS = {"1", "2"}
DATE_MIN_YEAR = 1970
DATE_MAX_YEAR = 2035

# Candidate variable names, in preference order.
ALIASES = {
    "platform": ("PLATFORM_NUMBER", "PLATFORM", "PLATFORM_ID", "WMO_ID"),
    "cycle": ("CYCLE_NUMBER", "CYCLE_NUM", "CYCLE"),
    "time": ("JULD", "JULD_ADJUSTED", "TIME", "TIME_ADJUSTED", "PROFILE_TIME"),
    "lat": ("LATITUDE", "LAT", "LATITUDE_ADJUSTED"),
    "lon": ("LONGITUDE", "LON", "LON_ADJUSTED"),
    "date_qc": ("JULD_QC", "TIME_QC"),
    "pos_qc": ("POSITION_QC", "LATITUDE_QC", "LONGITUDE_QC", "DQC"),
    "pres": ("PRES_ADJUSTED", "PRES", "PRES_BG", "PRES_BKG"),
    "pres_qc": ("PRES_ADJUSTED_QC", "PRES_QC"),
    "temp": ("TEMP_ADJUSTED", "TEMP"),
    "temp_qc": ("TEMP_ADJUSTED_QC", "TEMP_QC"),
    "psal": ("PSAL_ADJUSTED", "PSAL"),
    "psal_qc": ("PSAL_ADJUSTED_QC", "PSAL_QC"),
    "depth": ("DEPTH",),
}

TIME_UNITS_RE = re.compile(r"(days?|hours?|minutes?|seconds?|milliseconds?)\s+since\s+([0-9T:\- ]+)")


# --------------------------------------------------------------------------- #
# small helpers
# --------------------------------------------------------------------------- #

def first_var(ds: xr.Dataset, names: tuple) -> str | None:
    for name in names:
        if name in ds.variables:
            return name
    return None


def to_float_array(values) -> np.ndarray:
    """Return a plain float64 ndarray; masked/fill entries become NaN."""
    arr = np.asarray(values)
    if isinstance(arr, np.ma.MaskedArray):
        arr = np.ma.filled(arr, np.nan)
    arr = np.asarray(arr)
    if arr.dtype.kind in ("S", "U", "O"):
        out = np.full(arr.shape, np.nan, dtype=float)
        for idx, v in zip(np.ndindex(arr.shape), arr):
            if isinstance(v, (bytes, bytearray)):
                v = v.decode("latin1", "replace").strip()
            try:
                out[idx] = float(v)
            except (TypeError, ValueError):
                out[idx] = np.nan
        return out
    if arr.dtype.kind == "M":
        return arr.astype("datetime64[ns]").astype(object)
    try:
        return arr.astype(float)
    except (TypeError, ValueError):
        return to_float_array(list(arr.flat))


def qc_flag(value) -> str | None:
    """Normalise one QC value to its string flag, or None for fill/NaN/invalid."""
    if value is None:
        return None
    if np.ma.is_masked(value):
        return None
    if isinstance(value, (bytes, bytearray)):
        s = value.decode("latin1", "replace").strip()
    elif isinstance(value, str):
        s = value.strip()
    elif isinstance(value, (np.integer, int)):
        s = str(int(value))
    else:
        try:
            f = float(value)
        except (TypeError, ValueError):
            return None
        if math.isnan(f):
            return None
        s = str(int(f)) if f.is_integer() else str(f)
    return s or None


def qc_mask(values) -> np.ndarray:
    """Boolean keep-mask: True where the QC flag is 1 or 2."""
    values = np.atleast_1d(values)
    out = np.empty(len(values), dtype=bool)
    for i, v in enumerate(values):
        flag = qc_flag(v)
        out[i] = flag is not None and flag in VALID_QC_FLAGS
    return out


def scalar_qc_ok(value) -> bool:
    """Per-profile QC flag: pass when the flag is 1/2, or unknown/absent."""
    flag = qc_flag(value)
    return flag is None or flag in VALID_QC_FLAGS


def decode_dates(values, units: str | None) -> list:
    """Convert a CF time variable to a list of date objects (None for fill)."""
    arr = np.asarray(values)
    out: list = []
    if isinstance(arr, np.ma.MaskedArray):
        arr = np.ma.filled(arr, np.nan)
    if arr.dtype.kind == "M":
        for v in arr.ravel():
            try:
                out.append(None if np.isnat(v) else v.astype("datetime64[ns]").astype(object))
            except Exception:
                out.append(None)
        return out
    if arr.dtype == object:
        for v in arr.ravel():
            out.append(v if hasattr(v, "month") else None)
        return out
    m = TIME_UNITS_RE.match(units or "")
    if not m or cftime is None:
        return [None] * len(arr)
    unit, epoch = m.group(1).strip(), m.group(2).strip().rstrip(" UTC").replace("T", " ").strip()
    nums = to_float_array(arr)
    try:
        raw = cftime.num2date(nums, f"{unit} since {epoch}", calendar="standard")
    except Exception:
        return [None] * len(arr)
    for r, v in zip(raw, nums):
        out.append(None if math.isnan(v) else r)
    return out


def date_ok(date) -> bool:
    year = getattr(date, "year", None)
    return year is not None and DATE_MIN_YEAR <= int(year) <= DATE_MAX_YEAR


def valid_position(lat, lon):
    """Return (lat, lon) with east-positive longitudes normalised to
    [-180, 180], or None when either value is fill/NaN/out of bounds."""
    for v in (lat, lon):
        if v is None or np.ma.is_masked(v):
            return None
    try:
        lat = float(lat)
        lon = float(lon)
    except (TypeError, ValueError):
        return None
    if math.isnan(lat) or math.isnan(lon):
        return None
    if abs(lat) > 90.0 or abs(lon) > 180.0:
        return None
    if lon > 180.0:
        lon -= 360.0
    return lat, lon


def in_region(lat, lon, region) -> bool:
    return region["lat_min"] <= lat <= region["lat_max"] and region["lon_min"] <= lon <= region["lon_max"]


def pressure_to_depth_m(pressure_dbar: np.ndarray) -> np.ndarray:
    """Approximate positive-downward depth (m) from pressure (dbar).

    depth = p * 10^4 Pa/dbar / (g * rho0) ~= 0.9931 * p; constant-density
    approximation - see the module docstring.
    """
    return pressure_dbar * PA_PER_DBAR / (GRAVITY * RHO0)


def _scalar_number(values, i: int) -> float | None:
    """Element i of a (possibly masked) scalar/1-D variable as float|NaN."""
    arr = np.asarray(values)
    el = arr[i] if arr.ndim > 0 and arr.shape[0] > i else arr
    if np.ma.is_masked(el):
        return None
    try:
        f = float(el)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else f


def _platform_at(ds: xr.Dataset, name: str | None, i: int) -> str | None:
    if name is None or name not in ds.variables:
        return None
    v = ds[name].values
    el = v[i] if v.ndim > 0 and v.shape[0] > i else v
    if np.ma.is_masked(el):
        return None
    if isinstance(el, (bytes, bytearray)):
        el = el.decode("latin1", "replace")
    el = str(el).strip()
    return el or None


def _meta_size(ds: xr.Dataset, name: str) -> int:
    """Number of profiles a metadata variable describes (char dims excluded)."""
    v = ds[name]
    n = 1
    for d in v.dims:
        if not str(d).startswith("STRING"):
            n *= int(ds.sizes[d])
    return n


# --------------------------------------------------------------------------- #
# layout detection
# --------------------------------------------------------------------------- #

def detect_layout(ds: xr.Dataset):
    """Classify the file.

    Returns ('argo3', profile_dim, level_dim) for Argo-3.x / DAC profile
    files (2-D levels + 1-D per-profile metadata on the profile dim),
    ('time2d', profile_dim, level_dim) for other 2-D profile collections,
    ('one1d', None, None) for legacy single-profile files, or None when
    the file holds no profiles (trajectory/metadata/tech file).
    """
    temp_var = first_var(ds, ALIASES["temp"])
    pres_var = first_var(ds, ALIASES["pres"])
    depth_var = first_var(ds, ALIASES["depth"])
    level_var = None
    for cand in (temp_var, pres_var, depth_var):
        if cand is not None and len(ds[cand].dims) == 2:
            level_var = cand
            break

    if level_var is not None:
        d_profile, d_level = ds[level_var].dims
        platform = first_var(ds, ALIASES["platform"])
        lat = first_var(ds, ALIASES["lat"])
        if platform is not None and lat is not None:
            plat = ds[platform]
            if plat.dims and plat.dims[0] == d_profile and _meta_size(ds, platform) == int(ds.sizes[d_profile]):
                return "argo3", d_profile, d_level
        return "time2d", d_profile, d_level

    # 1-D: only accept when all metadata is scalar (one profile per file);
    # a 1-D file whose metadata runs alongside the whole array is a
    # trajectory, not a profile.
    meta = [first_var(ds, ALIASES[k]) for k in ("platform", "lat", "lon", "time", "cycle")]
    meta = [m for m in meta if m is not None]
    if meta and all(_meta_size(ds, m) in (0, 1) for m in meta) and (temp_var or pres_var or depth_var):
        return "one1d", None, None
    return None


# --------------------------------------------------------------------------- #
# per-profile extraction (shared across layouts)
# --------------------------------------------------------------------------- #

class Stats:
    def __init__(self) -> None:
        self.files_scanned = 0
        self.files_with_profiles = 0
        self.files_non_profile = 0
        self.files_failed = 0
        self.profiles_found = 0
        self.profiles_exported = 0
        self.skipped: Counter = Counter()
        self.file_lines: list = []
        self.collisions = 0


def _load_level_var(ds: xr.Dataset, name: str | None):
    """2-D (or 1-D) level variable as a plain ndarray (NaN fills) or raw
    object array for QC char variables. None when absent."""
    if name is None or name not in ds.variables:
        return None
    arr = np.asarray(ds[name].values)
    if isinstance(arr, np.ma.MaskedArray):
        # keep char QC arrays raw (masked bytes matter); numeric -> NaN
        if arr.dtype.kind in ("S", "U", "O"):
            return arr
        arr = np.ma.filled(arr, np.nan)
    arr = np.asarray(arr)
    if arr.dtype.kind in ("S", "U", "O"):
        return arr
    return to_float_array(arr)


def _row(arr, i: int):
    """Per-profile slice of a level array (1-D arrays are shared)."""
    if arr is None:
        return None
    return arr[i] if arr.ndim > 1 else arr


def _merged_measure(names: tuple, arrays: dict, i: int,
                    qc_arrays: dict, qc_names: tuple):
    """Merge the raw and adjusted level rows of one profile, per level.

    The adjusted value wins where it is finite; the raw value fills the
    levels where the adjusted array holds fill values. The returned
    QC keep-mask follows the value actually used at each level (matching
    QC flags, as required by the Argo data policy).

    Returns (values, qc_keep_mask_or_None); (None, None) when neither
    raw nor adjusted data exists.
    """
    adj_name = names[0]
    raw_names = list(names[1:])
    adj = (_row(arrays.get(adj_name), i)
           if adj_name in arrays and arrays.get(adj_name) is not None else None)
    raw_name, raw = None, None
    for n in raw_names:
        if n in arrays and arrays[n] is not None:
            raw_name, raw = n, _row(arrays[n], i)
            break
    if adj is None and raw is None:
        return None, None

    qc_of = dict(zip([adj_name] + raw_names, qc_names))

    def qc_row(name: str):
        qn = qc_of.get(name)
        if qn is not None and qn in qc_arrays and qc_arrays[qn] is not None:
            return qc_mask(_row(qc_arrays[qn], i))
        return None

    if adj is None:
        return raw, qc_row(raw_name)
    if raw is None:
        return adj, qc_row(adj_name)

    adj_used = np.isfinite(adj)
    values = np.where(adj_used, adj, raw)
    qc_adj, qc_raw = qc_row(adj_name), qc_row(raw_name)
    if qc_adj is None and qc_raw is None:
        qc = None
    elif qc_adj is None:
        qc = qc_raw
    elif qc_raw is None:
        qc = qc_adj
    else:
        qc = np.where(adj_used, qc_adj, qc_raw)
    return values, qc


def emit_profile(*, i, platform, cycle, date, lat_raw, lon_raw, date_qc_raw, pos_qc_raw,
                 temps, temp_qcs, psals, psal_qcs, press, depths, depth_name,
                 region, year, depth_max, stats: Stats, used_ids: set) -> dict | None:
    """Apply the per-profile filter chain; return the profile dict or None
    (the skip reason is recorded in stats)."""

    def skip(reason: str) -> None:
        stats.skipped[reason] += 1

    if not platform:
        skip("no platform ID in file")
        return None
    if date is None or not date_ok(date):
        skip("invalid or missing profile date")
        return None
    if not scalar_qc_ok(date_qc_raw):
        skip("date QC flag not 1/2")
        return None
    if year is not None and int(getattr(date, "year", 0)) != year:
        skip(f"outside target year ({year})")
        return None
    pos = valid_position(lat_raw, lon_raw)
    if pos is None:
        skip("invalid position (fill/NaN/out of bounds)")
        return None
    lat, lon = pos
    if not scalar_qc_ok(pos_qc_raw):
        skip("position QC flag not 1/2")
        return None
    if not in_region(lat, lon, region):
        skip("outside visualized Indian Ocean region")
        return None

    t_vals, t_qc = _merged_measure(ALIASES["temp"], temps, i, temp_qcs, ALIASES["temp_qc"])
    s_vals, s_qc = _merged_measure(ALIASES["psal"], psals, i, psal_qcs, ALIASES["psal_qc"])
    if t_vals is None or not np.isfinite(t_vals).any():
        skip("no temperature data")
        return None
    if s_vals is None or not np.isfinite(s_vals).any():
        skip("no salinity data")
        return None

    if depth_name is not None and depths.get(depth_name) is not None:
        d_vals = _row(depths[depth_name], i)
    else:
        p_vals, _ = _merged_measure(ALIASES["pres"], press, i, {}, ALIASES["pres_qc"])
        if p_vals is None:
            skip("no pressure or depth data")
            return None
        d_vals = pressure_to_depth_m(p_vals)

    keep = np.isfinite(d_vals) & np.isfinite(t_vals) & np.isfinite(s_vals)
    keep &= (d_vals >= 0.0) & (d_vals <= depth_max)
    if t_qc is not None:
        keep &= t_qc
    if s_qc is not None:
        keep &= s_qc
    if not keep.any():
        skip("no valid levels after QC / fill filtering")
        return None

    series = []
    for j in np.where(keep)[0]:
        series.append({
            "depth": round(float(d_vals[j]), 2),
            "temp": round(float(t_vals[j]), 3),
            "sal": round(float(s_vals[j]), 3),
        })
    series.sort(key=lambda p: p["depth"])

    base_id = f"{platform}-{cycle if cycle is not None else 0}"
    pid, k = base_id, 2
    while pid in used_ids:
        pid = f"{base_id}-{k}"
        k += 1
    if pid != base_id:
        stats.collisions += 1
    used_ids.add(pid)

    return {
        "id": pid,
        "lat": round(float(lat), 4),
        "lon": round(float(lon), 4),
        "month": int(getattr(date, "month", 0)) or 1,
        "surfaceTemp": series[0]["temp"],  # shallowest valid temperature
        "series": series,
    }


class FileContext:
    """Everything emit_profile needs for one file, loaded once."""

    def __init__(self, ds: xr.Dataset):
        self.ds = ds
        self.platform = first_var(ds, ALIASES["platform"])
        self.cycle = first_var(ds, ALIASES["cycle"])
        self.time = first_var(ds, ALIASES["time"])
        self.time_units = ds[self.time].attrs.get("units") if self.time else None
        self.lat = first_var(ds, ALIASES["lat"])
        self.lon = first_var(ds, ALIASES["lon"])
        self.date_qc = first_var(ds, ALIASES["date_qc"])
        self.pos_qc = first_var(ds, ALIASES["pos_qc"])
        self.depth_name = first_var(ds, ALIASES["depth"])
        self.temps = {k: _load_level_var(ds, k) for k in ALIASES["temp"]}
        self.temp_qcs = {k: _load_level_var(ds, k) for k in ALIASES["temp_qc"]}
        self.psals = {k: _load_level_var(ds, k) for k in ALIASES["psal"]}
        self.psal_qcs = {k: _load_level_var(ds, k) for k in ALIASES["psal_qc"]}
        self.press = {k: _load_level_var(ds, k) for k in ALIASES["pres"]}
        self.depths = {k: _load_level_var(ds, k) for k in ALIASES["depth"]}

    def profile_count(self, profile_dim: str | None) -> int:
        if profile_dim is not None:
            return int(self.ds.sizes[profile_dim])
        v = next(iter(self.temps.values()), None) or next(iter(self.press.values()), None)
        return int(v.size) if v is not None else 0

    def extract(self, i: int, region, year, depth_max, stats, used_ids):
        ds = self.ds
        return emit_profile(
            i=i,
            platform=_platform_at(ds, self.platform, i),
            cycle=int(_scalar_number(ds[self.cycle].values, i)) if self.cycle and _scalar_number(ds[self.cycle].values, i) is not None else None,
            date=(lambda: (lambda d: d[0] if d else None)(
                decode_dates(np.asarray([ds[self.time].values[i]]), self.time_units)) if self.time else None)(),
            lat_raw=ds[self.lat].values[i] if self.lat and np.asarray(ds[self.lat].values).ndim > 0 else
                  (ds[self.lat].values if self.lat else None),
            lon_raw=ds[self.lon].values[i] if self.lon and np.asarray(ds[self.lon].values).ndim > 0 else
                  (ds[self.lon].values if self.lon else None),
            date_qc_raw=ds[self.date_qc].values[i] if self.date_qc and np.asarray(ds[self.date_qc].values).ndim > 0 else
                  (ds[self.date_qc].values if self.date_qc else None),
            pos_qc_raw=ds[self.pos_qc].values[i] if self.pos_qc and np.asarray(ds[self.pos_qc].values).ndim > 0 else
                  (ds[self.pos_qc].values if self.pos_qc else None),
            temps=self.temps, temp_qcs=self.temp_qcs, psals=self.psals, psal_qcs=self.psal_qcs,
            press=self.press, depths=self.depths, depth_name=self.depth_name,
            region=region, year=year, depth_max=depth_max, stats=stats, used_ids=used_ids,
        )


def process_file(path: Path, raw_dir: Path, region: dict, year: int | None, depth_max: float,
                 stats: Stats, used_ids: set) -> list:
    stats.files_scanned += 1
    rel = str(path.relative_to(raw_dir)) if path.is_relative_to(raw_dir) else str(path)
    try:
        ds = xr.open_dataset(path, mask_and_scale=True, decode_times=False)
    except Exception as exc:
        stats.files_failed += 1
        stats.file_lines.append(f"  [error]   {rel}: could not open ({exc.__class__.__name__})")
        return []
    try:
        layout = detect_layout(ds)
        if layout is None:
            stats.files_non_profile += 1
            stats.file_lines.append(f"  [skip]    {rel}: no Argo profile variables "
                                    f"(trajectory/metadata/tech file)")
            return []
        kind, profile_dim, _level_dim = layout
        stats.files_with_profiles += 1
        ctx = FileContext(ds)
        n = ctx.profile_count(profile_dim)
        profiles = []
        for i in range(n):
            stats.profiles_found += 1
            p = ctx.extract(i, region, year, depth_max, stats, used_ids)
            if p is not None:
                profiles.append(p)
        stats.profiles_exported += len(profiles)
        stats.file_lines.append(f"  [profile] {rel}: {n} profile(s) in file, "
                                f"{len(profiles)} exported")
        return profiles
    finally:
        ds.close()


# --------------------------------------------------------------------------- #
# inspection (requirement 1)
# --------------------------------------------------------------------------- #

def inspect_files(paths: list) -> None:
    """Report dimensions, variable names, fill values and QC fields for each
    real input file, plus basic profile statistics for profile files."""
    from datetime import timedelta
    base = datetime(1950, 1, 1)
    for path in paths:
        print("=" * 78)
        print(f"FILE: {path}  ({path.stat().st_size:,} bytes)")
        try:
            ds = netCDF4.Dataset(str(path))
        except Exception as exc:
            print(f"  !! could not open: {exc}")
            continue
        try:
            print(f"  conventions : {ds.getncattr('Conventions') if 'Conventions' in ds.ncattrs() else '-'}")
            if "featureType" in ds.ncattrs():
                print(f"  featureType : {ds.getncattr('featureType')}")
            dims = {k: v for k, v in ds.dimensions.items()
                    if not k.startswith("STRING") and k not in ("DATE_TIME", "N_CALIB", "N_HISTORY", "N_PARAM")}
            print(f"  dimensions  : {dims}")
            qc_vars = [v for v in ds.variables if v.upper().endswith("_QC")]
            print(f"  QC fields   : {qc_vars if qc_vars else 'none'}")
            print("  variables   :")
            for k in sorted(ds.variables):
                v = ds.variables[k]
                line = f"    {k:30s} dims={v.dimensions} dtype={v.dtype} shape={v.shape}"
                fv = getattr(v, "_FillValue", None)
                mv = getattr(v, "missing_value", None)
                if fv is not None:
                    line += f" _FillValue={fv!r}"
                if mv is not None:
                    line += f" missing_value={mv!r}"
                if "units" in v.ncattrs():
                    line += f" units={v.getncattr('units')!r}"
                print(line)
            if "N_PROF" in ds.dimensions and "PRES" in ds.variables and "TEMP" in ds.variables:
                n = ds.dimensions["N_PROF"].size
                dates = []
                if "JULD" in ds.variables:
                    for d in np.array(ds["JULD"][:], dtype=float):
                        if not np.isclose(d, 999999.0):
                            dates.append(base + timedelta(days=float(d)))
                if dates:
                    months = Counter(d.month for d in dates)
                    print(f"  profile data: {n} profiles, {min(dates):%Y-%m-%d} .. {max(dates):%Y-%m-%d}")
                    print(f"  months      : {dict(sorted(months.items()))}")
                lat = np.array(ds["LATITUDE"][:], float)
                lon = np.array(ds["LONGITUDE"][:], float)
                ok = (lat != 99999.0) & (lon != 99999.0)
                print(f"  positions   : lat {lat[ok].min():.2f}..{lat[ok].max():.2f}, "
                      f"lon {lon[ok].min():.2f}..{lon[ok].max():.2f} (valid {int(ok.sum())}/{n})")
        finally:
            ds.close()
    print("=" * 78)


# --------------------------------------------------------------------------- #
# validation + report (requirement 5)
# --------------------------------------------------------------------------- #

def validate_profiles(data, region: dict, depth_max: float):
    """Return (ok, error list) for the full frontend contract."""
    errors: list = []
    if not isinstance(data, list):
        return False, ["top-level value is not a JSON array"]
    if len(data) == 0:
        return False, ["no profiles in the file"]
    seen: set = set()
    for n, p in enumerate(data):
        where = f"profile[{n}]"
        if not isinstance(p, dict):
            errors.append(f"{where}: not an object")
            continue
        pid = p.get("id")
        if not isinstance(pid, str) or not pid:
            errors.append(f"{where}: missing/invalid id")
        elif pid in seen:
            errors.append(f"{where}: duplicate id {pid!r}")
        else:
            seen.add(pid)
        for key in ("lat", "lon"):
            v = p.get(key)
            if not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(float(v)):
                errors.append(f"{where}.{key}: not a finite number")
        lat, lon = p.get("lat"), p.get("lon")
        if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
            if not in_region(float(lat), float(lon), region):
                errors.append(f"{where}: position outside visualized region")
        m = p.get("month")
        if not isinstance(m, int) or isinstance(m, bool) or not (1 <= m <= 12):
            errors.append(f"{where}.month: must be an integer 1-12")
        st = p.get("surfaceTemp")
        if not isinstance(st, (int, float)) or isinstance(st, bool) or not math.isfinite(float(st)):
            errors.append(f"{where}.surfaceTemp: not a finite number")
        series = p.get("series")
        if not isinstance(series, list) or not series:
            errors.append(f"{where}.series: must be a non-empty array")
            continue
        prev_depth = -1.0
        for k, pt in enumerate(series):
            if not isinstance(pt, dict):
                errors.append(f"{where}.series[{k}]: not an object")
                continue
            for label in ("depth", "temp", "sal"):
                v = pt.get(label)
                if not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(float(v)):
                    errors.append(f"{where}.series[{k}].{label}: not a finite number")
            d = pt.get("depth")
            if isinstance(d, (int, float)):
                if not (0.0 <= float(d) <= depth_max):
                    errors.append(f"{where}.series[{k}].depth out of range [0, {depth_max}]")
                if float(d) < prev_depth:
                    errors.append(f"{where}.series[{k}]: depths not ascending")
                prev_depth = float(d)
        if len(errors) > 500:
            break
    return len(errors) == 0, errors


def write_json(path: Path, profiles: list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(profiles, fh, separators=(",", ":"))
    os.replace(tmp, path)


def run_convert(raw_dir: Path, out_path: Path, region: dict, year: int | None, depth_max: float) -> int:
    paths = sorted(raw_dir.rglob("*.nc"))
    if not paths:
        print(f"ERROR: no .nc files found under {raw_dir}", file=sys.stderr)
        print("Place Argo NetCDF files under data/raw/ (git-ignored) and re-run.", file=sys.stderr)
        return 2

    stats = Stats()
    used_ids: set = set()
    all_profiles: list = []
    for path in paths:
        all_profiles.extend(process_file(path, raw_dir, region, year, depth_max, stats, used_ids))
    all_profiles.sort(key=lambda p: (p["lat"], p["lon"]))

    write_json(out_path, all_profiles)

    try:
        with open(out_path, "r", encoding="utf-8") as fh:
            on_disk = json.load(fh)
        json_ok, json_err = True, []
    except Exception as exc:
        on_disk, json_ok, json_err = None, False, [f"invalid JSON: {exc}"]
    schema_ok, schema_err = (validate_profiles(on_disk, region, depth_max)
                             if json_ok else (False, ["skipped (invalid JSON)"]))

    size_bytes = out_path.stat().st_size if out_path.exists() else 0
    size_mb = size_bytes / (1024 * 1024)

    print("=" * 78)
    print("Argo NetCDF -> profiles.json conversion report")
    print("=" * 78)
    print(f"input dir   : {raw_dir}")
    print(f"output file : {out_path}")
    print(f"region      : lon {region['lon_min']:.0f}..{region['lon_max']:.0f}, "
          f"lat {region['lat_min']:.0f}..{region['lat_max']:.0f}")
    print(f"target year : {year if year is not None else 'any (disabled)'}    "
          f"depth max: {depth_max:.0f} m")
    print()
    print(f"files scanned : {stats.files_scanned} "
          f"({stats.files_with_profiles} profile file(s), "
          f"{stats.files_non_profile} non-profile, {stats.files_failed} unreadable)")
    for line in stats.file_lines:
        print(line)
    print()
    print(f"profiles found   : {stats.profiles_found}")
    print(f"profiles exported: {stats.profiles_exported}")
    skipped_total = sum(stats.skipped.values())
    print(f"profiles skipped : {skipped_total}")
    if stats.skipped:
        print("skip reasons     :")
        for reason, count in sorted(stats.skipped.items(), key=lambda kv: -kv[1]):
            print(f"  - {reason}: {count}")
    if stats.collisions:
        print(f"ID collisions resolved with profile-index suffixes: {stats.collisions}")
    if all_profiles:
        months = sorted({p["month"] for p in all_profiles})
        lats = [p["lat"] for p in all_profiles]
        lons = [p["lon"] for p in all_profiles]
        levels = [len(p["series"]) for p in all_profiles]
        print()
        print("exported data  : months " + str(months))
        print(f"                 lat {min(lats):.2f}..{max(lats):.2f}, "
              f"lon {min(lons):.2f}..{max(lons):.2f}")
        print(f"                 levels/profile: min {min(levels)}, max {max(levels)}, "
              f"avg {sum(levels) / len(levels):.0f}")
    print()
    print("validation     :")
    print(f"  - file exists             : {'OK' if out_path.exists() else 'FAIL'}")
    print(f"  - valid JSON              : {'OK' if json_ok else 'FAIL (' + '; '.join(json_err) + ')'}")
    if json_ok and on_disk:
        print(f"  - at least one profile    : OK ({len(on_disk)} profiles)")
    else:
        print("  - at least one profile    : FAIL")
    if schema_ok:
        print(f"  - schema check            : OK ({len(on_disk)}/{len(on_disk)} profiles valid: "
              "unique ids, month 1-12, finite values, region bounds, series "
              "sorted by ascending depth)")
    else:
        print("  - schema check            : FAIL")
        for e in schema_err[:20]:
            print(f"      {e}")
    print(f"  - output size             : {size_mb:.2f} MB ({size_bytes:,} bytes)")
    if size_mb > MAX_STATIC_MB:
        print()
        print(f"WARNING: profiles.json exceeds the {MAX_STATIC_MB:.0f} MB static-site budget.")
        print("Serving a file this large from a static site is not practical; a backend/API")
        print("(e.g. a spatial/temporal database plus a JSON endpoint, or tiled data) will be")
        print("needed before deploying the full archive. Do not ship this file as a static asset.")
    else:
        print(f"  - static-site size budget : OK (below {MAX_STATIC_MB:.0f} MB)")

    ok = out_path.exists() and json_ok and bool(on_disk) and schema_ok
    print()
    print("RESULT: " + ("OK - real profiles ready for the frontend" if ok else "FAILED - see problems above"))
    return 0 if ok else 1


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Convert Argo NetCDF files to profiles.json")
    ap.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR,
                    help=f"directory scanned recursively for *.nc (default: {DEFAULT_RAW_DIR})")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT,
                    help=f"output JSON path (default: {DEFAULT_OUT})")
    ap.add_argument("--year", default=str(DEFAULT_YEAR),
                    help="target year to keep, or 'all' to disable (default: 2019)")
    ap.add_argument("--lat-min", type=float, default=DEFAULT_REGION["lat_min"])
    ap.add_argument("--lat-max", type=float, default=DEFAULT_REGION["lat_max"])
    ap.add_argument("--lon-min", type=float, default=DEFAULT_REGION["lon_min"])
    ap.add_argument("--lon-max", type=float, default=DEFAULT_REGION["lon_max"])
    ap.add_argument("--depth-max", type=float, default=DEFAULT_DEPTH_MAX,
                    help="maximum depth in m kept per profile (default: 2000)")
    ap.add_argument("--inspect", action="store_true",
                    help="only inspect the .nc files (dimensions, variables, fill values, "
                         "QC fields) and exit")
    args = ap.parse_args(argv)

    if not args.raw_dir.is_dir():
        print(f"ERROR: raw data directory not found: {args.raw_dir}", file=sys.stderr)
        return 2
    if args.year.strip().lower() != "all":
        try:
            year: int | None = int(args.year)
        except ValueError:
            print(f"ERROR: --year must be an integer or 'all', got {args.year!r}", file=sys.stderr)
            return 2
    else:
        year = None
    region = {"lat_min": args.lat_min, "lat_max": args.lat_max,
              "lon_min": args.lon_min, "lon_max": args.lon_max}

    if args.inspect:
        inspect_files(sorted(args.raw_dir.rglob("*.nc")))
        return 0
    return run_convert(args.raw_dir, args.out, region, year, args.depth_max)


if __name__ == "__main__":
    sys.exit(main())
