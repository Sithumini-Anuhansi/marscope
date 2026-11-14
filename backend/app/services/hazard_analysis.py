"""Evidence-first hazard assessments over available MOLA terrain derivatives."""

from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Any

try:
    import numpy as np
    import rasterio
    from rasterio.windows import Window
    GEOSPATIAL_DEPENDENCIES_AVAILABLE = True
except ImportError:  # Core FastAPI install remains usable without optional GIS libraries.
    np = None  # type: ignore[assignment]
    rasterio = None  # type: ignore[assignment]
    Window = None  # type: ignore[assignment,misc]
    GEOSPATIAL_DEPENDENCIES_AVAILABLE = False

from app.data_processing.mars_coordinates import normalize_east_longitude, raster_cell_center

PROJECT_ROOT = Path(__file__).resolve().parents[3]
PROCESSED_ROOT = PROJECT_ROOT / "data" / "processed" / "mola"
AVAILABLE_METRICS = {
    "terrain_slope": ("terrain_slope_deg.tif", "slope", "degree", "Derived from MOLA topography by centered finite differences."),
    "surface_roughness": ("terrain_roughness_std_m.tif", "roughness", "m", "3x3-cell population standard deviation of MOLA topography."),
    "elevation_variation": ("mola_topography_m.tif", "elevation", "m", "Regional maximum minus minimum of MOLA topography relative to the areoid."),
}
UNAVAILABLE_METRICS = ("crater_depression", "temperature", "wind", "dust", "radiation")
SEVERITIES = {"low", "moderate", "high", "critical"}


class HazardPolicyError(ValueError):
    """Raised for incomplete or incompatible classification policies."""


def _latest_run() -> tuple[Path, dict[str, Any]] | None:
    for manifest_path in sorted(PROCESSED_ROOT.glob("MEGT90N000CB-*/processing-manifest.json"), reverse=True):
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            if manifest.get("product_id") == "MEGT90N000CB" and all(
                (manifest_path.parent / item["file"]).is_file() for item in manifest.get("outputs", {}).values()
            ):
                return manifest_path.parent, manifest
        except (OSError, ValueError, KeyError, TypeError):
            continue
    return None


def _policy() -> dict[str, Any] | None:
    policy_path = os.getenv("MARSCOPE_HAZARD_POLICY_PATH")
    if not policy_path:
        return None
    path = Path(policy_path).expanduser().resolve()
    policy = json.loads(path.read_text(encoding="utf-8"))
    required = ("policy_id", "reference", "rationale", "intended_use", "max_cell_resolution_km", "rules")
    if any(not policy.get(field) for field in required):
        raise HazardPolicyError("Policy must include ID, reference, rationale, intended use, resolution limit, and rules")
    if not isinstance(policy["rules"], list) or not math.isfinite(float(policy["max_cell_resolution_km"])):
        raise HazardPolicyError("Policy rules must be a list and its resolution limit must be finite")
    for rule in policy["rules"]:
        if rule.get("category") not in AVAILABLE_METRICS or rule.get("severity") not in SEVERITIES:
            raise HazardPolicyError("Policy rule uses an unsupported metric category or severity")
        if rule.get("comparison") not in {"gt", "gte", "lt", "lte"} or not isinstance(rule.get("threshold"), (int, float)):
            raise HazardPolicyError("Each policy rule needs a numeric threshold and valid comparison")
        if not math.isfinite(float(rule["threshold"])):
            raise HazardPolicyError("Policy thresholds must be finite")
        if not rule.get("rationale") or not rule.get("reference"):
            raise HazardPolicyError("Each threshold rule requires its own rationale and source reference")
    return policy


def _classify(category: str, value: float, policy: dict[str, Any] | None, units: str) -> dict[str, Any]:
    if policy is None:
        return {
            "severity": "unclassified",
            "classification_status": "no-validated-policy",
            "reason": "No reviewed, resolution-appropriate severity policy is configured; this metric is not labeled safe or hazardous.",
        }
    if float(policy["max_cell_resolution_km"]) < 14.817845349:
        return {
            "severity": "unclassified",
            "classification_status": "policy-incompatible-resolution",
            "reason": "The configured policy requires finer source data than the available MOLA sample.",
        }
    matched_rules = []
    for rule in policy["rules"]:
        if rule["category"] != category or rule.get("units") != units:
            continue
        match = {"gt": value > rule["threshold"], "gte": value >= rule["threshold"],
                 "lt": value < rule["threshold"], "lte": value <= rule["threshold"]}[rule["comparison"]]
        if match:
            matched_rules.append(rule)
    if matched_rules:
        severity_order = {"low": 0, "moderate": 1, "high": 2, "critical": 3}
        rule = max(matched_rules, key=lambda match: severity_order[match["severity"]])
        return {
            "severity": rule["severity"],
            "classification_status": "classified-under-configured-policy",
            "policy_id": policy["policy_id"], "policy_reference": rule["reference"],
            "policy_rationale": rule["rationale"], "intended_use": policy["intended_use"],
            "applied_rule": {"comparison": rule["comparison"], "threshold": rule["threshold"], "units": units},
        }
    return {
        "severity": "unclassified",
        "classification_status": "no-matching-policy-rule",
        "reason": "No configured rule applies to this category and unit; no safe classification is inferred.",
    }


def active_classification_policy() -> dict[str, Any] | None:
    """Return the configured cited rule policy, if any."""
    return _policy()


def classify_terrain_metric(category: str, value: float, units: str,
                            policy: dict[str, Any] | None = None) -> dict[str, Any]:
    """Classify one supported terrain metric under an explicit policy only."""
    if category not in AVAILABLE_METRICS:
        return {"severity": "unclassified", "classification_status": "unsupported-feature"}
    return _classify(category, value, _policy() if policy is None else policy, units)


def _coordinate_to_cell(dataset: rasterio.io.DatasetReader, longitude_deg: float, latitude_deg: float) -> tuple[int, int]:
    longitude_360 = longitude_deg % 360.0
    radius_m = dataset.crs.to_dict().get("a", 3396000.0)
    x = math.radians(longitude_360 - 180.0) * radius_m
    y = math.radians(latitude_deg) * radius_m
    row, column = dataset.index(x, y)
    return min(max(row, 0), dataset.height - 1), column % dataset.width


def _source_metadata(dataset: rasterio.io.DatasetReader, manifest: dict[str, Any]) -> dict[str, Any]:
    tags = dataset.tags()
    try:
        period = json.loads(tags.get("source_period_utc", "[]"))
    except json.JSONDecodeError:
        period = []
    return {
        "dataset_id": "mola", "product_id": manifest["product_id"],
        "source_period_utc": period,
        "source_sha256": tags.get("source_sha256"),
        "resolution_km_per_cell": 14.817845349,
        "latitude_type": tags.get("latitude_type", "planetocentric"),
        "longitude_direction": tags.get("longitude_direction", "positive-east"),
        "quality": "coarse historical global grid; PDS label notes empty bins may be interpolated and this product has no per-cell observation-count mask",
        "uncertainty": "not quantified by this product or processing pipeline",
    }


def _metric_assessment(category: str, value: float, units: str, method: str,
                       source: dict[str, Any], policy: dict[str, Any] | None,
                       coordinate: dict[str, float]) -> dict[str, Any]:
    classification = _classify(category, value, policy, units)
    return {
        "assessment_id": f"derived-{category}-{coordinate['row']}-{coordinate['column']}",
        "category": category, "observation_kind": "derived", "coordinates": coordinate,
        "measurement": {"value": value, "units": units}, "severity": classification.pop("severity"),
        "methodology": method, "source_dataset": source,
        "data_quality": source["quality"], "uncertainty": source["uncertainty"],
        "classification": classification,
    }


def assess_location(latitude_deg: float, longitude_deg: float, categories: list[str] | None = None) -> dict[str, Any]:
    requested = categories or list(AVAILABLE_METRICS) + list(UNAVAILABLE_METRICS)
    invalid = sorted(set(requested) - set(AVAILABLE_METRICS) - set(UNAVAILABLE_METRICS))
    if invalid:
        raise ValueError(f"Unsupported hazard categories: {', '.join(invalid)}")
    if not math.isfinite(latitude_deg) or not -90.0 <= latitude_deg <= 90.0:
        raise ValueError("planetocentric latitude must be finite and in [-90, 90]")
    longitude = normalize_east_longitude(longitude_deg)
    if not GEOSPATIAL_DEPENDENCIES_AVAILABLE:
        return {
            "assessment_status": "insufficient-information", "assessment_mode": "derived-terrain-metrics",
            "requested_location": {"latitude_deg": latitude_deg, "longitude_deg": longitude, "latitude_type": "planetocentric"},
            "assessments": [], "unavailable_categories": requested,
            "message": "Optional geospatial dependencies are not installed. The location is unassessed, not safe.",
        }
    run = _latest_run()
    if run is None:
        return {
            "assessment_status": "insufficient-information", "assessment_mode": "derived-terrain-metrics",
            "requested_location": {"latitude_deg": latitude_deg, "longitude_deg": longitude, "latitude_type": "planetocentric"},
            "assessments": [], "unavailable_categories": requested,
            "message": "No processed MOLA terrain dataset is available. The location is unassessed, not safe.",
        }

    run_dir, manifest = run
    metrics = []
    row = column = 0
    source_metadata: dict[str, Any] | None = None
    with rasterio.open(run_dir / "mola_topography_m.tif") as dem:
        row, column = _coordinate_to_cell(dem, longitude, latitude_deg)
        center_lon, center_lat = raster_cell_center(row, column, height=dem.height, width=dem.width)
        source_metadata = _source_metadata(dem, manifest)
        row_indices = np.clip(np.arange(row - 1, row + 2), 0, dem.height - 1)
        row_start = int(row_indices.min())
        elevation_window = dem.read(1, window=Window(0, row_start, dem.width, 3))
        col_indices = [(column + offset) % dem.width for offset in (-1, 0, 1)]
        row_values = elevation_window[row_indices - row_start, :][:, col_indices]
        elevation_variation = float(np.nanmax(row_values) - np.nanmin(row_values))

    coordinate = {"longitude_deg": center_lon, "latitude_deg": center_lat, "latitude_type": "planetocentric",
                  "longitude_direction": "positive-east", "row": row, "column": column}
    for category in requested:
        if category in UNAVAILABLE_METRICS:
            metrics.append({
                "assessment_id": f"unavailable-{category}", "category": category,
                "observation_kind": "unavailable", "severity": "unclassified",
                "classification": {"classification_status": "data-unavailable", "reason": "No validated source dataset is connected for this category."},
            })
            continue
        filename, _band, units, method = AVAILABLE_METRICS[category]
        if category == "elevation_variation":
            value = elevation_variation
        else:
            with rasterio.open(run_dir / filename) as dataset:
                value = float(dataset.read(1, window=Window(column, row, 1, 1))[0, 0])
        if not math.isfinite(value) or value == -9999.0:
            metrics.append({"assessment_id": f"unavailable-{category}-{row}-{column}", "category": category,
                            "observation_kind": "unavailable", "severity": "unclassified",
                            "classification": {"classification_status": "invalid-source-cell", "reason": "Source cell is missing or invalid."}})
            continue
        metrics.append(_metric_assessment(category, value, units, method, source_metadata or {}, _policy(), coordinate))

    return {
        "assessment_status": "limited-assessment" if metrics else "insufficient-information",
        "assessment_mode": "derived-terrain-metrics", "requested_location": {"latitude_deg": latitude_deg, "longitude_deg": longitude, "latitude_type": "planetocentric"},
        "sampled_cell": coordinate, "processing_run": manifest["processing_run"],
        "assessments": metrics, "hazard_features": {"type": "FeatureCollection", "features": []},
        "message": "Terrain metrics are contextual data, not a safety decision. Unclassified metrics do not imply safe terrain.",
    }


def _column_segments(west: float, east: float, width: int) -> list[tuple[int, int]]:
    span = abs(east - west)
    if span >= 360.0:
        return [(0, width)]
    span = (east - west) % 360.0
    start = (west % 360.0) / 360.0 * width
    stop = start + span / 360.0 * width
    first = int(math.floor(start)) % width
    length = max(1, int(math.ceil(stop - start)))
    last_unwrapped = first + length
    if last_unwrapped <= width:
        return [(first, last_unwrapped)]
    return [(first, width), (0, last_unwrapped - width)]


def summarize_region(west: float, south: float, east: float, north: float,
                     categories: list[str] | None = None) -> dict[str, Any]:
    if not math.isfinite(west) or not math.isfinite(east):
        raise ValueError("longitude bounds must be finite")
    if not (-90 <= south < north <= 90):
        raise ValueError("Require -90 <= south latitude < north latitude <= 90 (planetocentric degrees)")
    requested = categories or list(AVAILABLE_METRICS) + list(UNAVAILABLE_METRICS)
    invalid = sorted(set(requested) - set(AVAILABLE_METRICS) - set(UNAVAILABLE_METRICS))
    if invalid:
        raise ValueError(f"Unsupported hazard categories: {', '.join(invalid)}")
    if not GEOSPATIAL_DEPENDENCIES_AVAILABLE:
        return {"assessment_status": "insufficient-information", "assessments": [], "unavailable_categories": requested,
                "message": "Optional geospatial dependencies are not installed. Region is unassessed, not safe."}
    run = _latest_run()
    if run is None:
        return {"assessment_status": "insufficient-information", "assessments": [], "unavailable_categories": requested,
                "message": "No processed MOLA terrain dataset is available. Region is unassessed, not safe."}
    run_dir, manifest = run
    row_start = max(0, min(719, int(math.floor((90.0 - north) / 180.0 * 720))))
    row_stop = max(row_start + 1, min(720, int(math.ceil((90.0 - south) / 180.0 * 720))))
    columns = _column_segments(west, east, 1440)
    output = []
    source_metadata = None
    for category in requested:
        if category in UNAVAILABLE_METRICS:
            output.append({"category": category, "observation_kind": "unavailable", "severity": "unclassified",
                           "classification": {"classification_status": "data-unavailable", "reason": "No validated source dataset is connected for this category."}})
            continue
        filename, _band, units, method = AVAILABLE_METRICS[category]
        minimum = math.inf
        maximum = -math.inf
        total = 0.0
        count = 0
        with rasterio.open(run_dir / filename) as dataset:
            source_metadata = source_metadata or _source_metadata(dataset, manifest)
            for start in range(row_start, row_stop, 64):
                stop = min(row_stop, start + 64)
                for col_start, col_stop in columns:
                    if col_stop <= col_start:
                        continue
                    values = dataset.read(1, window=Window(col_start, start, col_stop - col_start, stop - start)).astype(np.float64)
                    valid = np.isfinite(values) & (values != dataset.nodata)
                    if not valid.any():
                        continue
                    selected = values[valid]
                    minimum = min(minimum, float(selected.min()))
                    maximum = max(maximum, float(selected.max()))
                    total += float(selected.sum())
                    count += int(selected.size)
        if count == 0:
            output.append({"category": category, "observation_kind": "unavailable", "severity": "unclassified",
                           "classification": {"classification_status": "no-valid-cells", "reason": "The selected region contains no valid raster cells."}})
            continue
        value = maximum - minimum if category == "elevation_variation" else maximum
        classification = _classify(category, value, _policy(), units)
        output.append({
            "assessment_id": f"derived-{category}-{manifest['processing_run']}", "category": category,
            "observation_kind": "derived", "severity": classification.pop("severity"),
            "summary": {"minimum": minimum, "maximum": maximum, "mean": total / count,
                        "elevation_range_m": value if category == "elevation_variation" else None,
                        "sample_count": count, "units": units},
            "methodology": method, "source_dataset": source_metadata,
            "data_quality": source_metadata["quality"], "uncertainty": source_metadata["uncertainty"],
            "classification": classification,
        })
    return {
        "assessment_status": "limited-assessment", "assessment_mode": "regional-derived-terrain-metrics",
        "region": {"west_longitude_deg": west, "east_longitude_deg": east,
                   "south_latitude_deg": south, "north_latitude_deg": north,
                   "latitude_type": "planetocentric", "longitude_direction": "positive-east"},
        "processing_run": manifest["processing_run"], "assessments": output,
        "hazard_features": {"type": "FeatureCollection", "features": []},
        "message": "Regional metrics summarize raster cells and are not hazard polygons or safety classifications.",
    }


def service_status() -> dict[str, Any]:
    if not GEOSPATIAL_DEPENDENCIES_AVAILABLE:
        return {
            "status": "geospatial-dependencies-missing", "available_categories": [],
            "unavailable_categories": list(AVAILABLE_METRICS) + list(UNAVAILABLE_METRICS),
            "severity_policy": "none; metrics remain unclassified", "processing_run": None,
            "message": "Install backend/requirements-geo.txt to enable local raster analysis; no region is considered safe.",
        }
    run = _latest_run()
    policy_path = os.getenv("MARSCOPE_HAZARD_POLICY_PATH")
    return {
        "status": "available-limited" if run else "unavailable",
        "available_categories": list(AVAILABLE_METRICS) if run else [],
        "unavailable_categories": list(UNAVAILABLE_METRICS),
        "severity_policy": "configured" if policy_path else "none; metrics remain unclassified",
        "processing_run": run[1]["processing_run"] if run else None,
        "message": "No safe location can be inferred from missing inputs, unclassified metrics, or absent hazard layers.",
    }
