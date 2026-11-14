"""Label-driven MOLA MEGDR raster validation and terrain derivative processing."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import tempfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.transform import from_origin
from rasterio.windows import Window

PRODUCT = "megt90n000cb"
DEFAULT_CHUNK_ROWS = 32
NODATA = -9999.0


class RasterValidationError(ValueError):
    """Raised when the source image, label, and ingestion manifest disagree."""


def _local(element: ET.Element, name: str) -> bool:
    return element.tag.rsplit("}", 1)[-1] == name


def _label_text(root: ET.Element, name: str) -> str:
    for element in root.iter():
        if _local(element, name):
            return (element.text or "").strip()
    raise RasterValidationError(f"PDS label is missing {name}")


def _axis_dimensions(root: ET.Element) -> dict[str, int]:
    dimensions: dict[str, int] = {}
    for axis in root.iter():
        if not _local(axis, "Axis_Array"):
            continue
        name = next((child for child in axis if _local(child, "axis_name")), None)
        count = next((child for child in axis if _local(child, "elements")), None)
        if name is not None and count is not None:
            dimensions[(name.text or "").strip()] = int(count.text or "0")
    return dimensions


def _reference_frame(root: ET.Element) -> str:
    for element in root.iter():
        if _local(element, "Reference_Frame_Identification"):
            name = next((child for child in element if _local(child, "name")), None)
            if name is not None:
                return (name.text or "").strip()
    raise RasterValidationError("PDS label is missing its reference frame name")


def _find_text(root: ET.Element, name: str) -> tuple[str, str | None]:
    for element in root.iter():
        if _local(element, name):
            return (element.text or "").strip(), element.attrib.get("unit")
    raise RasterValidationError(f"PDS label is missing {name}")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def validate_mola_source(raw_dir: str | Path) -> tuple[Path, Path, Path, ET.Element, dict, int, int, float, float, float, float, float]:
    """Cross-check the raw product against PDS label and downloaded manifest."""
    raw = Path(raw_dir).expanduser().resolve()
    image = raw / f"{PRODUCT}.img"
    label = raw / f"{PRODUCT}.xml"
    manifest_path = raw / f"{PRODUCT}.manifest.json"
    if not all(path.is_file() for path in (image, label, manifest_path)):
        raise RasterValidationError("MOLA IMG, PDS XML label, and ingestion manifest must all be present")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("product_id") != "MEGT90N000CB":
        raise RasterValidationError("Ingestion manifest product ID does not match the expected MOLA product")
    root = ET.parse(label).getroot()
    dimensions = _axis_dimensions(root)
    if set(dimensions) != {"Line", "Sample"}:
        raise RasterValidationError(f"Unexpected PDS image axes: {dimensions}")
    height, width = dimensions["Line"], dimensions["Sample"]
    if (height, width) != (720, 1440):
        raise RasterValidationError("This processor currently supports the labeled global 4 ppd MOLA sample only (720 x 1440)")
    if _label_text(root, "data_type") != "SignedMSB2" or _label_text(root, "unit") != "meter":
        raise RasterValidationError("Expected SignedMSB2 topography measured in meters")
    if _label_text(root, "map_projection_name") != "Equirectangular":
        raise RasterValidationError("Only this product's labeled equirectangular projection is supported")
    if _label_text(root, "axis_index_order") != "Last Index Fastest":
        raise RasterValidationError("Unsupported PDS array index ordering")
    if _label_text(root, "coordinate_system_name").upper() != "PLANETOCENTRIC":
        raise RasterValidationError("Expected planetocentric latitude in PDS label")
    radius_text, radius_unit = _find_text(root, "a_axis_radius")
    if radius_unit != "km" or float(radius_text) <= 0:
        raise RasterValidationError("Unexpected MOLA projection sphere radius")
    radius_m = float(radius_text) * 1000.0
    x_res, x_unit = _find_text(root, "pixel_resolution_x")
    y_res, y_unit = _find_text(root, "pixel_resolution_y")
    if x_unit != "km/pixel" or y_unit != "km/pixel":
        raise RasterValidationError("PDS pixel resolution units are missing or unsupported")
    x_resolution_m, y_resolution_m = float(x_res) * 1000.0, float(y_res) * 1000.0
    x_scale, x_scale_unit = _find_text(root, "pixel_scale_x")
    y_scale, y_scale_unit = _find_text(root, "pixel_scale_y")
    if x_scale_unit != "pixel/deg" or y_scale_unit != "pixel/deg":
        raise RasterValidationError("PDS pixel scale units are missing or unsupported")
    if float(x_scale) != float(y_scale) or float(x_scale) != manifest.get("resolution_pixels_per_degree"):
        raise RasterValidationError("PDS resolution and ingestion manifest disagree")
    if image.stat().st_size != height * width * 2:
        raise RasterValidationError("Raw IMG byte count does not match PDS dimensions and encoding")
    if _sha256(image) != manifest.get("sha256", {}).get("image"):
        raise RasterValidationError("Raw IMG SHA-256 does not match the ingestion manifest")
    if _sha256(label) != manifest.get("sha256", {}).get("label"):
        raise RasterValidationError("PDS label SHA-256 does not match the ingestion manifest")
    if manifest.get("bytes", {}).get("image") != image.stat().st_size:
        raise RasterValidationError("Raw IMG byte count does not match the ingestion manifest")
    reference_frame = _reference_frame(root)
    if reference_frame != "IAU2000_MARS" or "planetocentric" not in manifest.get("coordinate_reference", "").lower():
        raise RasterValidationError("PDS frame or manifest latitude convention is unsupported")
    if _label_text(root, "longitude_direction").lower() != "positive east" or "positive-east" not in manifest.get("coordinate_reference", "").lower():
        raise RasterValidationError("PDS longitude direction and ingestion manifest disagree")
    upper_left_x, _ = _find_text(root, "upperleft_corner_x")
    upper_left_y, _ = _find_text(root, "upperleft_corner_y")
    return image, label, manifest_path, root, manifest, height, width, x_resolution_m, y_resolution_m, radius_m, float(upper_left_x), float(upper_left_y)


def _windows(height: int, width: int, chunk_rows: int) -> Iterator[tuple[int, int]]:
    if chunk_rows < 1:
        raise ValueError("chunk_rows must be positive")
    for row_start in range(0, height, chunk_rows):
        yield row_start, min(height, row_start + chunk_rows)


def _terrain_chunk(source: np.memmap, start: int, stop: int, height: int, width: int,
                   pixel_x_m: float, pixel_y_m: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    # One-row halo lets centered finite differences span chunk boundaries.
    halo_start, halo_stop = max(0, start - 1), min(height, stop + 1)
    elev_halo = np.asarray(source[halo_start:halo_stop], dtype=np.float32)
    first = start - halo_start
    center = elev_halo[first:first + stop - start]
    north_idx = np.maximum(np.arange(start, stop) - 1, 0) - halo_start
    south_idx = np.minimum(np.arange(start, stop) + 1, height - 1) - halo_start
    north = elev_halo[north_idx]
    south = elev_halo[south_idx]

    latitudes = np.deg2rad(90.0 - (np.arange(start, stop, dtype=np.float64) + 0.5) * (180.0 / height))
    east_spacing = pixel_x_m * np.maximum(np.cos(latitudes), 1e-8)
    dz_east = (np.roll(center, -1, axis=1) - np.roll(center, 1, axis=1)) / (2.0 * east_spacing[:, None])
    dz_north = (north - south) / (2.0 * pixel_y_m)  # positive derivative points north
    slope = np.degrees(np.arctan(np.hypot(dz_east, dz_north))).astype(np.float32)
    # Downslope azimuth, clockwise from north; flat-cell aspect is undefined (-1).
    aspect = np.mod(np.degrees(np.arctan2(-dz_east, -dz_north)), 360.0).astype(np.float32)
    aspect[np.hypot(dz_east, dz_north) < 1e-12] = NODATA

    # Population standard deviation over a 3x3 neighborhood; wrap longitude at seam.
    squared_sum = np.zeros(center.shape, dtype=np.float64)
    value_sum = np.zeros(center.shape, dtype=np.float64)
    for row_offset in (-1, 0, 1):
        source_rows = np.clip(np.arange(start, stop) + row_offset, 0, height - 1) - halo_start
        row_values = elev_halo[source_rows]
        for col_offset in (-1, 0, 1):
            neighbors = np.roll(row_values, col_offset, axis=1).astype(np.float64, copy=False)
            value_sum += neighbors
            squared_sum += neighbors * neighbors
    count = 9.0
    variance = np.maximum(squared_sum / count - (value_sum / count) ** 2, 0.0)
    roughness = np.sqrt(variance).astype(np.float32)
    return slope, aspect, roughness


def process_mola(raw_dir: str | Path, output_dir: str | Path, *, chunk_rows: int = DEFAULT_CHUNK_ROWS) -> dict:
    """Write georeferenced source DEM and derived terrain GeoTIFFs in row chunks."""
    image, _label, _manifest, label_root, source_manifest, height, width, px, py, radius_m, ulx, uly = validate_mola_source(raw_dir)
    output_root = Path(output_dir).expanduser().resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    run_name = f"MEGT90N000CB-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}"
    with tempfile.TemporaryDirectory(prefix=".mola-processing-", dir=output_root) as staging_name:
        staging = Path(staging_name)
        profile = {
            "driver": "GTiff", "width": width, "height": height, "count": 1,
            "dtype": "float32", "crs": CRS.from_proj4(
                f"+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=180 +a={radius_m} +b={radius_m} +units=m +no_defs"
            ),
            "transform": from_origin(ulx, uly, px, py),
            "nodata": NODATA, "compress": "deflate", "predictor": 3,
            "tiled": True, "blockxsize": 256, "blockysize": 256,
        }
        outputs = {
            "elevation": ("mola_topography_m.tif", "m", "MOLA median topography relative to MOLA areoid"),
            "slope": ("terrain_slope_deg.tif", "degree", "Finite-difference terrain slope"),
            "aspect": ("terrain_aspect_deg.tif", "degree", "Downslope azimuth clockwise from north; flat-cell aspect is NoData"),
            "roughness": ("terrain_roughness_std_m.tif", "m", "Population standard deviation of a 3x3 elevation neighborhood"),
        }
        paths = {key: staging / record[0] for key, record in outputs.items()}
        source = np.memmap(image, dtype=">i2", mode="r", shape=(height, width))
        tags = {
            "source_product_id": source_manifest["product_id"],
            "source_period_utc": json.dumps(source_manifest["source_product_period_utc"]),
            "latitude_type": "planetocentric", "longitude_direction": "positive-east",
            "longitude_range_source": "0..360 degrees east", "source_sha256": source_manifest["sha256"]["image"],
            "data_quality_note": "MOLA label states empty bins may contain interpolated values; per-bin observation counts are not included in this product.",
            "source_observation_period_note": "Historical data; not current environmental conditions.",
        }
        with rasterio.open(paths["elevation"], "w", **profile) as dem, \
                rasterio.open(paths["slope"], "w", **profile) as slope_ds, \
                rasterio.open(paths["aspect"], "w", **profile) as aspect_ds, \
                rasterio.open(paths["roughness"], "w", **profile) as rough_ds:
            for dataset in (dem, slope_ds, aspect_ds, rough_ds):
                dataset.update_tags(**tags)
            for start, stop in _windows(height, width, chunk_rows):
                window = Window(0, start, width, stop - start)
                elevations = np.asarray(source[start:stop], dtype=np.float32)
                slope, aspect, roughness = _terrain_chunk(source, start, stop, height, width, px, py)
                dem.write(elevations, 1, window=window)
                slope_ds.write(slope, 1, window=window)
                aspect_ds.write(aspect, 1, window=window)
                rough_ds.write(roughness, 1, window=window)
            dem.update_tags(units="m", long_name=outputs["elevation"][2], source_unit="meter")
            slope_ds.update_tags(units="degree", long_name=outputs["slope"][2], method="centered finite differences; spherical equirectangular ground spacing")
            aspect_ds.update_tags(units="degree", long_name=outputs["aspect"][2], method="downslope azimuth; 0=N, 90=E")
            rough_ds.update_tags(units="m", long_name=outputs["roughness"][2], method="population standard deviation, 3x3 cells")
        source._mmap.close()

        result_dir = output_root / run_name
        os.replace(staging, result_dir)

    product = {
        "dataset_id": "mola", "product_id": source_manifest["product_id"],
        "processing_run": run_name, "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "inputs": {"image": str(image), "sha256": source_manifest["sha256"]["image"]},
        "dimensions": {"rows": height, "columns": width},
        "projection": f"Equirectangular, IAU2000_MARS, planetocentric, positive-east, central meridian 180 degrees; spherical radius {radius_m / 1000:g} km per PDS label",
        "pixel_resolution_m": {"x": px, "y": py},
        "processing_chunk_rows": chunk_rows,
        "outputs": {key: {"file": record[0], "units": record[1], "description": record[2]} for key, record in outputs.items()},
        "assumptions_and_limits": [
            "MOLA topography is a historical global product, not current surface conditions.",
            "PDS label states that empty bins may contain interpolated elevations; this product has no per-cell observation-count mask.",
            "Slope uses local centered differences and spherical equirectangular ground spacing; polar neighborhood distortion remains material.",
            "Roughness is the 3x3-cell population standard deviation at 0.25 degree sampling; it is not a rover-scale mobility measure.",
            "This output is not a validated traverse DEM, landing-site assessment, or safety classification.",
        ],
        "quality_status": "source-structure-validated; derivatives are exploratory and not scientifically quality-assessed",
    }
    manifest_file = result_dir / "processing-manifest.json"
    manifest_file.write_text(json.dumps(product, indent=2) + "\n", encoding="utf-8")
    return {"output_directory": str(result_dir), **product}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process the downloaded MOLA 4 ppd sample into georeferenced terrain layers")
    parser.add_argument("--raw-dir", default="../data/raw/mola")
    parser.add_argument("--output-dir", default="../data/processed/mola")
    parser.add_argument("--chunk-rows", type=int, default=DEFAULT_CHUNK_ROWS)
    args = parser.parse_args()
    print(json.dumps(process_mola(args.raw_dir, args.output_dir, chunk_rows=args.chunk_rows), indent=2))
