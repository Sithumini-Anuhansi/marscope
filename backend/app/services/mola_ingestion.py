"""Explicit, small-sample MOLA MEGDR download from the PDS Geosciences Node."""

from __future__ import annotations

import hashlib
import argparse
import json
import os
import tempfile
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

PDS_BASE = (
    "https://pds-geosciences.wustl.edu/mgs/"
    "urn-nasa-pds-mgs_mola_topography_derived/meg004"
)
PRODUCT = "megt90n000cb"
EXPECTED_IMAGE_BYTES = 2_073_600  # 720 x 1440 cells x signed 16-bit integer
MAX_LABEL_BYTES = 2_000_000


class DatasetDownloadError(RuntimeError):
    """Raised when a PDS sample cannot be retrieved or validated."""


def _download(url: str, destination: Path, max_bytes: int) -> int:
    request = urllib.request.Request(url, headers={"User-Agent": "MARSCOPE/0.1 dataset-ingestion"})
    temporary_name: str | None = None
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            declared_size = response.headers.get("Content-Length")
            if declared_size and int(declared_size) > max_bytes:
                raise DatasetDownloadError(f"Remote file exceeds the {max_bytes}-byte limit")
            with tempfile.NamedTemporaryFile(
                mode="wb", dir=destination.parent, prefix=f".{destination.name}.", delete=False
            ) as temporary:
                temporary_name = temporary.name
                total = 0
                while chunk := response.read(64 * 1024):
                    total += len(chunk)
                    if total > max_bytes:
                        raise DatasetDownloadError(f"Downloaded file exceeds the {max_bytes}-byte limit")
                    temporary.write(chunk)
        if total == 0:
            raise DatasetDownloadError("Remote file was empty")
        os.replace(temporary_name, destination)
        return total
    except Exception:
        if temporary_name and os.path.exists(temporary_name):
            os.unlink(temporary_name)
        raise


def _value(root: ET.Element, local_name: str) -> str:
    for element in root.iter():
        if element.tag.rsplit("}", 1)[-1] == local_name:
            return (element.text or "").strip()
    raise DatasetDownloadError(f"Required PDS label field is missing: {local_name}")


def ingest_mola_sample(raw_dir: str | Path) -> dict[str, object]:
    """Fetch the 4 pixel/degree global MOLA topography product and PDS4 label.

    This is an explicit operation; the application never downloads data at startup.
    The original image and label are retained byte-for-byte in the raw directory.
    """
    raw_path = Path(raw_dir).expanduser().resolve()
    raw_path.mkdir(parents=True, exist_ok=True)
    image_path = raw_path / f"{PRODUCT}.img"
    label_path = raw_path / f"{PRODUCT}.xml"
    manifest_path = raw_path / f"{PRODUCT}.manifest.json"
    base = f"{PDS_BASE}/{PRODUCT}"

    # Download and validate into a staging directory so incomplete pairs are not published.
    with tempfile.TemporaryDirectory(prefix="marscope-mola-") as staging:
        staging_path = Path(staging)
        staged_label = staging_path / label_path.name
        staged_image = staging_path / image_path.name
        label_size = _download(f"{base}.xml", staged_label, MAX_LABEL_BYTES)
        try:
            label_root = ET.parse(staged_label).getroot()
        except ET.ParseError as exc:
            raise DatasetDownloadError("PDS4 XML label is malformed") from exc
        label_text = " ".join(label_root.itertext()).lower()
        if "mola" not in label_text or "topograph" not in label_text:
            raise DatasetDownloadError("PDS4 label does not identify a MOLA topography product")
        dimensions: dict[str, int] = {}
        for axis in label_root.iter():
            if axis.tag.rsplit("}", 1)[-1] != "Axis_Array":
                continue
            axis_name = next((child for child in axis if child.tag.rsplit("}", 1)[-1] == "axis_name"), None)
            element_count = next((child for child in axis if child.tag.rsplit("}", 1)[-1] == "elements"), None)
            if axis_name is not None and element_count is not None:
                dimensions[(axis_name.text or "").strip()] = int(element_count.text or "0")
        if dimensions != {"Line": 720, "Sample": 1440}:
            raise DatasetDownloadError(f"Unexpected raster dimensions in PDS4 label: {dimensions}")
        if _value(label_root, "data_type") != "SignedMSB2" or _value(label_root, "unit") != "meter":
            raise DatasetDownloadError("PDS4 label does not declare signed 16-bit big-endian meter data")
        if _value(label_root, "map_projection_name") != "Equirectangular":
            raise DatasetDownloadError("Unexpected map projection in PDS4 label")

        image_size = _download(f"{base}.img", staged_image, EXPECTED_IMAGE_BYTES)
        expected_image_size = dimensions["Line"] * dimensions["Sample"] * 2
        if image_size != expected_image_size:
            raise DatasetDownloadError(
                f"Unexpected image size: expected {EXPECTED_IMAGE_BYTES} bytes, received {image_size}"
            )

        image_sha256 = hashlib.sha256(staged_image.read_bytes()).hexdigest()
        label_sha256 = hashlib.sha256(staged_label.read_bytes()).hexdigest()
        os.replace(staged_label, label_path)
        os.replace(staged_image, image_path)

    manifest: dict[str, object] = {
        "dataset_id": "mola",
        "product_id": "MEGT90N000CB",
        "product_name": "MOLA MEGDR global topography, 4 pixels per degree",
        "source": "NASA PDS Geosciences Node, MGS MOLA Topography Derived PDS4 bundle",
        "source_url": f"{base}.img",
        "label_url": f"{base}.xml",
        "source_product_period_utc": [
            _value(label_root, "geometry_start_time_utc"),
            _value(label_root, "geometry_stop_time_utc"),
        ],
        "resolution_pixels_per_degree": 4,
        "nominal_cell_resolution_km": {
            "x": _value(label_root, "pixel_resolution_x"),
            "y": _value(label_root, "pixel_resolution_y"),
            "unit": "km/pixel",
        },
        "measurement": "median topography per 0.25-degree bin, in meters relative to the MOLA areoid; empty bins may be interpolated",
        "coordinate_reference": "IAU2000_MARS planetocentric latitude, positive-east longitude; equirectangular projection; central meridian 180 degrees",
        "encoding": f"{_value(label_root, 'data_type')} raster; dimensions {dimensions['Line']} rows x {dimensions['Sample']} columns",
        "raw_files": {"image": image_path.name, "label": label_path.name},
        "bytes": {"image": image_size, "label": label_size},
        "sha256": {"image": image_sha256, "label": label_sha256},
        "validation": {
            "image_size": "passed",
            "label_xml": "passed",
            "label_product_check": "passed",
            "dimensions": "passed",
            "encoding_and_units": "passed",
            "projection": "passed",
        },
        "downloaded_at_utc": datetime.now(timezone.utc).isoformat(),
        "data_status": "downloaded-and-structurally-validated; not scientifically quality-assessed",
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download the small MOLA 4 ppd global topography sample")
    parser.add_argument("--raw-dir", default="../data/raw/mola", help="Directory for original PDS files and manifest")
    args = parser.parse_args()
    print(json.dumps(ingest_mola_sample(args.raw_dir), indent=2))
