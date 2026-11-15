"""Opt-in downloader for the official 128 pixel/degree MOLA MEGDR tiles.

Tiles are historical global topography, not rover-scale terrain or safety data.
Each run downloads only the longitude/latitude tile containing the requested
coordinate, retaining the PDS3 labels and SHA-256 provenance.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

PDS_BASE = "https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg128"
MAX_LABEL_BYTES = 2_000_000
PRODUCT_PATTERN = re.compile(r"^megt(\d{2}[ns])(\d{3})hb$", re.IGNORECASE)


def _fetch(url: str, path: Path, limit: int) -> int:
    request = urllib.request.Request(url, headers={"User-Agent": "MARSCOPE/0.1 scientific-data-ingestion"})
    tmp_name = None
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            declared = response.headers.get("Content-Length")
            if declared and int(declared) > limit:
                raise ValueError(f"{url} exceeds configured size limit")
            with tempfile.NamedTemporaryFile("wb", dir=path.parent, delete=False, prefix=f".{path.name}.") as tmp:
                tmp_name = tmp.name
                total = 0
                while chunk := response.read(1024 * 1024):
                    total += len(chunk)
                    if total > limit:
                        raise ValueError(f"{url} exceeds configured size limit")
                    tmp.write(chunk)
        if total == 0:
            raise ValueError(f"{url} returned an empty file")
        os.replace(tmp_name, path)
        return total
    except Exception:
        if tmp_name and os.path.exists(tmp_name):
            os.unlink(tmp_name)
        raise


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def tile_for_coordinate(latitude: float, longitude: float) -> str:
    if not -88 <= latitude <= 88:
        raise ValueError("128 ppd MEGDR tiles cover 88°N through 88°S")
    if not -180 <= longitude <= 360:
        raise ValueError("longitude must be between -180° and 360°")
    lon = longitude % 360
    lon_start = int(lon // 90) * 90
    # Product tags denote the band's upper edge: 88N, 44N, 00N (0 to 44S), 44S.
    if latitude >= 44:
        lat_band, hemi = 88, "n"
    elif latitude >= 0:
        lat_band, hemi = 44, "n"
    elif latitude >= -44:
        lat_band, hemi = 0, "n"
    else:
        lat_band, hemi = 44, "s"
    product = f"megt{lat_band:02d}{hemi}{lon_start:03d}hb"
    if not PRODUCT_PATTERN.match(product):
        raise ValueError("Could not select a valid PDS MEGDR tile")
    return product


def ingest_mola_128(latitude: float, longitude: float, raw_root: str | Path) -> dict:
    """Download one official topography/counts tile and validate its exact layout."""
    product = tile_for_coordinate(latitude, longitude)
    tile_dir = Path(raw_root).expanduser().resolve() / "mola-128ppd" / product.upper()
    tile_dir.mkdir(parents=True, exist_ok=True)
    topo_stem = product
    counts_stem = "megc" + product[4:]
    files = {
        f"{topo_stem}.img": 129_761_280,
        f"{topo_stem}.lbl": MAX_LABEL_BYTES,
        f"{counts_stem}.img": 64_880_640,
        f"{counts_stem}.lbl": MAX_LABEL_BYTES,
    }
    with tempfile.TemporaryDirectory(prefix="marscope-meg128-") as staging_name:
        staging = Path(staging_name)
        for filename, limit in files.items():
            _fetch(f"{PDS_BASE}/{filename}", staging / filename, limit)
        label = (staging / f"{topo_stem}.lbl").read_text(encoding="ascii", errors="replace")
        count_label = (staging / f"{counts_stem}.lbl").read_text(encoding="ascii", errors="replace")
        for required in ("LINES                        = 5632", "LINE_SAMPLES                 = 11520", "SAMPLE_BITS                  = 16", "SAMPLE_TYPE                  = MSB_INTEGER", "UNIT                         = METER", "MAP_RESOLUTION               = 128.0"):
            if required not in label:
                raise ValueError(f"PDS label did not contain expected declaration: {required.strip()}")
        for required in ("LINES                        = 5632", "LINE_SAMPLES                 = 11520", "SAMPLE_BITS                  = 8", "SAMPLE_TYPE                  = UNSIGNED_INTEGER", "MAP_RESOLUTION               = 128.0"):
            if required not in count_label:
                raise ValueError(f"Counts PDS label did not contain expected declaration: {required.strip()}")
        if (staging / f"{topo_stem}.img").stat().st_size != 5632 * 11520 * 2:
            raise ValueError("MOLA topography tile byte count does not match PDS dimensions")
        if (staging / f"{counts_stem}.img").stat().st_size != 5632 * 11520:
            raise ValueError("MOLA observation-count tile byte count does not match dimensions")
        checksums = {}
        byte_counts = {}
        for filename in files:
            destination = tile_dir / filename
            os.replace(staging / filename, destination)
            checksums[filename] = _sha256(destination)
            byte_counts[filename] = destination.stat().st_size
    manifest = {
        "dataset_id": "mola-128ppd", "product_id": product.upper(),
        "selected_coordinate": {"latitude_deg": latitude, "longitude_deg": longitude},
        "source_url": PDS_BASE, "source_node": "NASA PDS Geosciences Node",
        "resolution_pixels_per_degree": 128, "nominal_pixel_scale_km": 0.463,
        "dimensions": {"rows": 5632, "columns": 11520},
        "topography_units": "meters", "topography_encoding": "16-bit signed big-endian integer",
        "counts_encoding": "8-bit unsigned integer; per-cell MOLA observation count",
        "source_period_utc": ["1997-09-15T19:10:00", "2001-06-30T11:10:40"],
        "files": byte_counts, "sha256": checksums,
        "downloaded_at_utc": datetime.now(timezone.utc).isoformat(),
        "limitations": ["Historical orbital topography, not current environmental data.", "Approximately 463 m at the equator; insufficient to establish local EVA or rover safety.", "MOLA observation counts indicate evidence density, not measurement uncertainty or hazard labels."],
    }
    (tile_dir / "ingestion-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return {"directory": str(tile_dir), **manifest}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download one NASA PDS MOLA 128 ppd tile (about 186 MiB total)")
    parser.add_argument("--latitude", type=float, required=True)
    parser.add_argument("--longitude", type=float, required=True)
    parser.add_argument("--raw-root", default="../data/raw")
    args = parser.parse_args()
    print(json.dumps(ingest_mola_128(args.latitude, args.longitude, args.raw_root), indent=2))
