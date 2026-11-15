"""Create a bounded, counts-masked MOLA 128 ppd terrain study window."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.transform import from_origin

NODATA = -9999.0
PRODUCT = re.compile(r"^MEGT(\d{2})([NS])(\d{3})HB$", re.IGNORECASE)
METERS_PER_DEGREE = 3396000.0 * np.pi / 180.0


def process_mola_128(raw_dir: str | Path, output_dir: str | Path, latitude: float,
                     longitude: float, half_window_degrees: float = 0.5) -> dict:
    """Process a small local crop and mask elevations without MOLA observations."""
    if not 0 < half_window_degrees <= 2:
        raise ValueError("half_window_degrees must be >0 and <=2")
    raw = Path(raw_dir).expanduser().resolve()
    matches = sorted(raw.glob("mola-128ppd/MEGT*/ingestion-manifest.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    candidate = next((p for p in matches if json.loads(p.read_text(encoding="utf-8")).get("selected_coordinate") ==
                      {"latitude_deg": latitude, "longitude_deg": longitude}), None)
    if candidate is None:
        raise FileNotFoundError("No ingested 128 ppd tile matches; run app.services.mola_128_ingestion first")
    manifest = json.loads(candidate.read_text(encoding="utf-8"))
    product = manifest["product_id"]
    found = PRODUCT.fullmatch(product)
    if not found:
        raise ValueError("Unrecognized PDS MOLA tile identifier")
    for filename, expected_hash in manifest.get("sha256", {}).items():
        path = candidate.parent / filename
        digest = hashlib.sha256()
        with path.open("rb") as source_file:
            for block in iter(lambda: source_file.read(1024 * 1024), b""):
                digest.update(block)
        if digest.hexdigest() != expected_hash:
            raise ValueError(f"Ingested source checksum mismatch: {filename}")
    band, hemi, lon_start = int(found.group(1)), found.group(2).upper(), int(found.group(3))
    tile_top = band if hemi == "N" else -band
    tile_bottom = tile_top - 44
    lon = longitude % 360
    if not tile_bottom <= latitude <= tile_top or not lon_start <= lon <= lon_start + 90:
        raise ValueError("Requested point is outside the downloaded tile")
    ppd, height, width = 128, 5632, 11520
    half = half_window_degrees
    r0 = max(0, int(np.floor((tile_top - latitude - half) * ppd)))
    r1 = min(height, int(np.ceil((tile_top - latitude + half) * ppd)))
    c0 = max(0, int(np.floor((lon - lon_start - half) * ppd)))
    c1 = min(width, int(np.ceil((lon - lon_start + half) * ppd)))
    if r1 - r0 < 3 or c1 - c0 < 3:
        raise ValueError("Processing window is too close to a tile edge")
    topo = np.memmap(candidate.parent / f"{product.lower()}.img", dtype=">i2", mode="r", shape=(height, width))
    count_product = "MEGC" + product[4:]
    count_map = np.memmap(candidate.parent / f"{count_product.lower()}.img", dtype="u1", mode="r", shape=(height, width))
    elevation = np.asarray(topo[r0:r1, c0:c1], dtype=np.float32)
    counts = np.asarray(count_map[r0:r1, c0:c1], dtype=np.uint8)
    valid = counts > 0
    elevation[~valid] = NODATA
    # Derivatives use local finite differences and are descriptive only.
    lat_top = tile_top - r0 / ppd
    lat_rows = lat_top - (np.arange(r1-r0) + 0.5) / ppd
    dy = METERS_PER_DEGREE / ppd
    dx = np.maximum(np.cos(np.deg2rad(lat_rows)), 1e-6) * dy
    safe = elevation.copy()
    safe[~valid] = 0
    dz_n = -np.gradient(safe, dy, axis=0)
    dz_e = np.gradient(safe, axis=1) / dx[:, None]
    slope = np.degrees(np.arctan(np.hypot(dz_e, dz_n))).astype(np.float32)
    aspect = np.mod(np.degrees(np.arctan2(-dz_e, -dz_n)), 360).astype(np.float32)
    aspect[np.hypot(dz_e, dz_n) < 1e-12] = NODATA
    # 3x3 population standard deviation; scipy is included with the geo stack.
    from scipy.ndimage import generic_filter, minimum_filter
    roughness = generic_filter(safe, np.std, size=3, mode="nearest").astype(np.float32)
    derivative_valid = minimum_filter(valid.astype(np.uint8), size=3, mode="constant", cval=0).astype(bool)
    for layer in (slope, aspect, roughness):
        layer[~derivative_valid] = NODATA
    radius = 3396000.0
    ulx = np.deg2rad(lon_start + c0 / ppd - 180) * radius
    uly = np.deg2rad(lat_top) * radius
    pixel_m = METERS_PER_DEGREE / ppd
    crs = CRS.from_proj4(f"+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=180 +a={radius} +b={radius} +units=m +no_defs")
    output = Path(output_dir).expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)
    run_id = f"{product}-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}"
    layers = {"elevation": ("mola_topography_m.tif", elevation, "m"),
              "slope": ("terrain_slope_deg.tif", slope, "degree"),
              "aspect": ("terrain_aspect_deg.tif", aspect, "degree"),
              "roughness": ("terrain_roughness_std_m.tif", roughness, "m"),
              "observation_count": ("mola_observation_count.tif", counts.astype(np.float32), "count")}
    with tempfile.TemporaryDirectory(prefix=".mola128-", dir=output) as temp:
        stage = Path(temp)
        profile = {"driver": "GTiff", "width": c1-c0, "height": r1-r0, "count": 1,
                   "dtype": "float32", "crs": crs, "transform": from_origin(ulx, uly, pixel_m, pixel_m),
                   "nodata": NODATA, "compress": "deflate", "predictor": 3,
                   "tiled": True, "blockxsize": 256, "blockysize": 256}
        for key, (filename, data, units) in layers.items():
            with rasterio.open(stage / filename, "w", **profile) as dst:
                dst.write(data.astype(np.float32), 1)
                dst.update_tags(source_product=product, source_resolution_ppd="128",
                                source_period_utc=json.dumps(manifest.get("source_period_utc", [])), units=units,
                                zero_observation_policy="NoData" if key != "observation_count" else "zero indicates no MOLA observations",
                                interpretation="historical topographic evidence; not a safety or mobility label")
        result_dir = output / run_id
        os.replace(stage, result_dir)
    topo._mmap.close()
    count_map._mmap.close()
    result = {"dataset_id": "mola-128ppd", "product_id": product, "processing_run": run_id,
              "created_at_utc": datetime.now(timezone.utc).isoformat(),
              "source_ingestion_manifest": str(candidate), "source_sha256": manifest["sha256"],
              "study_window": {"center_latitude_deg": latitude, "center_longitude_deg": longitude,
                               "half_window_degrees": half, "dimensions": {"rows": r1-r0, "columns": c1-c0}},
              "pixel_resolution_m": {"x": pixel_m, "y": pixel_m},
              "outputs": {k: {"file": f, "units": u} for k, (f, _data, u) in layers.items()},
              "quality_status": "source-structure-validated; counts-masked exploratory terrain derivatives",
              "assumptions_and_limits": ["Approx. 463 m at equator; still too coarse for rover/EVA-scale safety.",
                  "MOLA counts indicate observation density, not uncertainty.",
                  "Derived slope and roughness are not validated hazard classes or mobility costs.",
                  "Historical topography contains no current weather, dust, radiation, or temperature."]}
    (result_dir / "processing-manifest.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return {"output_directory": str(result_dir), **result}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process a bounded MOLA 128 ppd local window")
    parser.add_argument("--raw-dir", default="../data/raw")
    parser.add_argument("--output-dir", default="../data/processed/mola-128ppd")
    parser.add_argument("--latitude", type=float, required=True)
    parser.add_argument("--longitude", type=float, required=True)
    parser.add_argument("--half-window-degrees", type=float, default=0.5)
    args = parser.parse_args()
    print(json.dumps(process_mola_128(args.raw_dir, args.output_dir, args.latitude, args.longitude, args.half_window_degrees), indent=2))
