"""A* route candidates over validated, mission-accepted Mars terrain rasters.

Route costs are configurable decision weights, not scientifically calibrated risk
or travel time. The service gates source resolution and reports missing hazards.
"""

from __future__ import annotations

import heapq
import json
import math
from collections import OrderedDict
from pathlib import Path
from typing import Any
from uuid import uuid4

try:
    import numpy as np
    import rasterio
except ImportError:  # Keep the core FastAPI install usable without optional GIS libraries.
    np = None  # type: ignore[assignment]
    rasterio = None  # type: ignore[assignment]

from app.schemas.route import RoutePlanningRequest
from app.services.hazard_analysis import _latest_run, _policy

MAX_CELLS_IN_MEMORY = 5_000_000
MAX_EXPANSIONS = 300_000
MARS_MEAN_RADIUS_M = 3_389_500.0
_ROUTE_RESULTS: OrderedDict[str, dict[str, Any]] = OrderedDict()


class RoutePlanningUnavailable(ValueError):
    """Raised for malformed or incompatible terrain products."""


def _normalize_lon(lon: float) -> float:
    return (lon + 180.0) % 360.0 - 180.0


def _latest_route_terrain_run() -> tuple[Path, dict[str, Any]] | None:
    """Prefer a validated local MOLA 128 ppd crop; fall back to global 4 ppd."""
    candidates = []
    project_root = Path(__file__).resolve().parents[3]
    for root in (project_root / "data" / "processed" / "mola-128ppd", project_root / "data" / "processed" / "mola"):
        for path in root.glob("*/processing-manifest.json"):
            try:
                manifest = json.loads(path.read_text(encoding="utf-8"))
                resolution = float(manifest.get("pixel_resolution_m", {}).get("x", 0))
                expected_id = "mola-128ppd" if "mola-128ppd" in str(root) else "mola"
                if manifest.get("dataset_id") != expected_id or resolution <= 0:
                    continue
                if all((path.parent / manifest["outputs"][key]["file"]).is_file() for key in ("elevation", "slope", "roughness")):
                    candidates.append((resolution, path.parent, manifest))
            except (OSError, ValueError, KeyError, TypeError):
                continue
    # Smaller meter-per-cell resolution is finer; new runs win ties.
    if candidates:
        _, run_dir, manifest = min(candidates, key=lambda item: (item[0], item[1].name))
        return run_dir, manifest
    return _latest_run()


def _great_circle_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lon1, lat1 = map(math.radians, a)
    lon2, lat2 = map(math.radians, b)
    dlat, dlon = lat2 - lat1, lon2 - lon1
    hav = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * (MARS_MEAN_RADIUS_M / 1000) * math.asin(min(1.0, math.sqrt(hav)))


def _coord_to_cell(dataset: rasterio.io.DatasetReader, point) -> tuple[int, int]:
    longitude = point.longitude_deg % 360.0
    radius = dataset.crs.to_dict().get("a", MARS_MEAN_RADIUS_M)
    x = math.radians(longitude - 180.0) * radius
    y = math.radians(point.latitude_deg) * radius
    row, col = dataset.index(x, y)
    row, col = int(row), int(col)
    if dataset.width == 1440 and dataset.height == 720:  # only the global 4 ppd product wraps at 0/360°
        return min(max(row, 0), dataset.height - 1), col % dataset.width
    if row < 0 or row >= dataset.height or col < 0 or col >= dataset.width:
        return -1, -1
    return row, col


def _cell_lonlat(dataset: rasterio.io.DatasetReader, row: int, col: int) -> tuple[float, float]:
    x, y = dataset.xy(row, col, offset="center")
    radius = dataset.crs.to_dict().get("a", MARS_MEAN_RADIUS_M)
    lon = _normalize_lon(180.0 + math.degrees(x / radius))
    lat = math.degrees(y / radius)
    return lon, lat


def _valid_cells(arrays: list[np.ndarray], nodata: float | None) -> np.ndarray:
    valid = np.ones(arrays[0].shape, dtype=bool)
    for array in arrays:
        valid &= np.isfinite(array)
        if nodata is not None:
            valid &= array != nodata
    return valid


def _policy_hazard_cells(slope: np.ndarray, roughness: np.ndarray, policy: dict | None) -> tuple[np.ndarray, bool]:
    blocked = np.zeros(slope.shape, dtype=bool)
    if not policy:
        return blocked, False
    comparators = {
        "gt": np.greater, "gte": np.greater_equal,
        "lt": np.less, "lte": np.less_equal,
    }
    for rule in policy["rules"]:
        if rule["severity"] not in {"high", "critical"}:
            continue
        if rule["category"] == "terrain_slope" and rule["units"] == "degree":
            values = slope
        elif rule["category"] == "surface_roughness" and rule["units"] == "m":
            values = roughness
        else:
            continue
        blocked |= comparators[rule["comparison"]](values, rule["threshold"])
    return blocked, True


def _astar(
    dataset: rasterio.io.DatasetReader,
    slope: np.ndarray,
    roughness: np.ndarray,
    valid: np.ndarray,
    blocked: np.ndarray,
    start: tuple[int, int],
    goal: tuple[int, int],
    slope_weight: float,
    roughness_weight: float,
    max_slope: float | None,
) -> list[tuple[int, int]] | None:
    height, width = slope.shape
    if max_slope is not None and (slope[start] > max_slope or slope[goal] > max_slope):
        return None
    if start == goal:
        return [start] if valid[start] and not blocked[start] else None

    def heuristic(cell: tuple[int, int]) -> float:
        return _great_circle_km(_cell_lonlat(dataset, *cell), _cell_lonlat(dataset, *goal))

    frontier: list[tuple[float, float, tuple[int, int]]] = [(heuristic(start), 0.0, start)]
    best = {start: 0.0}
    parent: dict[tuple[int, int], tuple[int, int]] = {}
    expansions = 0
    while frontier and expansions < MAX_EXPANSIONS:
        _priority, current_cost, cell = heapq.heappop(frontier)
        if current_cost != best.get(cell):
            continue
        if cell == goal:
            route = [goal]
            while route[-1] != start:
                route.append(parent[route[-1]])
            route.reverse()
            return route
        expansions += 1
        row, col = cell
        for dr in (-1, 0, 1):
            nr = row + dr
            if nr < 0 or nr >= height:
                continue
            for dc in (-1, 0, 1):
                if dr == 0 and dc == 0:
                    continue
                nc = (col + dc) % width
                neighbor = (nr, nc)
                if not valid[neighbor] or blocked[neighbor]:
                    continue
                if max_slope is not None and slope[neighbor] > max_slope:
                    continue
                distance = _great_circle_km(_cell_lonlat(dataset, row, col), _cell_lonlat(dataset, nr, nc))
                mean_slope = (float(slope[cell]) + float(slope[neighbor])) / 2
                mean_roughness = (float(roughness[cell]) + float(roughness[neighbor])) / 2
                edge_cost = distance * (1.0 + slope_weight * mean_slope + roughness_weight * mean_roughness)
                candidate = current_cost + edge_cost
                if candidate >= best.get(neighbor, math.inf):
                    continue
                best[neighbor] = candidate
                parent[neighbor] = cell
                heapq.heappush(frontier, (candidate + heuristic(neighbor), candidate, neighbor))
    return None


def _cache(result: dict[str, Any]) -> None:
    _ROUTE_RESULTS[result["route_request_id"]] = result
    _ROUTE_RESULTS.move_to_end(result["route_request_id"])
    while len(_ROUTE_RESULTS) > 50:
        _ROUTE_RESULTS.popitem(last=False)


def _geojson_line(points: list[tuple[float, float]]) -> dict[str, Any]:
    if not points:
        return {"type": "LineString", "coordinates": []}
    parts: list[list[list[float]]] = [[[points[0][0], points[0][1]]]]
    for (previous_lon, previous_lat), (longitude, latitude) in zip(points, points[1:]):
        if abs(longitude - previous_lon) > 180:
            unwrapped_lon = longitude + (360 if longitude < previous_lon else -360)
            boundary_lon = 180.0 if previous_lon > 0 else -180.0
            fraction = (boundary_lon - previous_lon) / (unwrapped_lon - previous_lon)
            boundary_lat = previous_lat + fraction * (latitude - previous_lat)
            parts[-1].append([boundary_lon, boundary_lat])
            opposite_boundary = -180.0 if boundary_lon == 180.0 else 180.0
            parts.append([[opposite_boundary, boundary_lat], [longitude, latitude]])
        else:
            parts[-1].append([longitude, latitude])
    if len(parts) == 1:
        return {"type": "LineString", "coordinates": parts[0]}
    return {"type": "MultiLineString", "coordinates": parts}


def get_route_result(route_request_id: str) -> dict[str, Any] | None:
    return _ROUTE_RESULTS.get(route_request_id)


def _unavailable(result_id: str, request: RoutePlanningRequest, reasons: list[str], source: dict | None = None) -> dict[str, Any]:
    return {
        "route_request_id": result_id,
        "status": "unavailable",
        "recommended_route": None,
        "alternative_routes": [],
        "source": source,
        "request": request.model_dump(mode="json"),
        "missing_information": reasons,
        "risk_summary": "No route was produced because available evidence does not meet the requested planning constraints.",
        "travel_time": None,
        "assumptions": ["No unavailable input is interpreted as safe or traversable."],
    }


def generate_routes(request: RoutePlanningRequest) -> dict[str, Any]:
    result_id = str(uuid4())
    run = _latest_route_terrain_run()
    if run and run[1].get("dataset_id") == "mola-128ppd":
        window = run[1].get("study_window", {})
        center_lat = float(window.get("center_latitude_deg", 999))
        center_lon = float(window.get("center_longitude_deg", 999))
        half = float(window.get("half_window_degrees", 0))
        def in_window(point) -> bool:
            lon_delta = abs((point.longitude_deg - center_lon + 180) % 360 - 180)
            return abs(point.latitude_deg - center_lat) <= half and lon_delta <= half
        if not (in_window(request.start) and in_window(request.destination)):
            # A detailed crop only covers its recorded study area. Use global
            # context when coordinates are elsewhere; its resolution gate remains.
            run = _latest_run()
    if run is None:
        result = _unavailable(result_id, request, ["validated, processed elevation, slope, and roughness rasters"])
        _cache(result)
        return result

    run_dir, manifest = run
    resolution = float(manifest.get("pixel_resolution_m", {}).get("x", 0)) / 1000.0
    source = {
        "dataset_id": manifest.get("dataset_id", "mola"), "product_id": manifest.get("product_id"),
        "processing_run": manifest.get("processing_run"),
        "source_period_utc": None,
        "cell_resolution_km": resolution,
        "quality": "historical orbital topography; only cells with MOLA observations are represented" if manifest.get("dataset_id") == "mola-128ppd" else "coarse historical global topography; interpolated empty bins cannot be identified",
    }
    missing = []
    if resolution <= 0:
        missing.append("a valid cell-resolution value in the processing manifest")
    elif resolution > request.maximum_source_cell_km:
        missing.append(
            f"source resolution {resolution:.3f} km/cell exceeds the mission-selected limit "
            f"{request.maximum_source_cell_km:.3f} km/cell"
        )
    for key in ("elevation", "slope", "roughness"):
        filename = manifest.get("outputs", {}).get(key, {}).get("file")
        if not filename or not (run_dir / filename).is_file():
            missing.append(f"processed MOLA {key} raster")
    if missing:
        result = _unavailable(result_id, request, missing, source)
        _cache(result)
        return result
    if np is None or rasterio is None:
        result = _unavailable(result_id, request, ["install backend/requirements-geo.txt for raster-based route planning"], source)
        _cache(result)
        return result

    filenames = {key: manifest["outputs"][key]["file"] for key in ("elevation", "slope", "roughness")}
    try:
        with rasterio.open(run_dir / filenames["elevation"]) as dem, \
                rasterio.open(run_dir / filenames["slope"]) as slope_ds, \
                rasterio.open(run_dir / filenames["roughness"]) as rough_ds:
            if dem.width * dem.height > MAX_CELLS_IN_MEMORY:
                result = _unavailable(result_id, request, ["raster exceeds in-memory routing budget; windowed graph routing is not configured"], source)
                _cache(result)
                return result
            if any((ds.width, ds.height, ds.transform, ds.crs) != (dem.width, dem.height, dem.transform, dem.crs) for ds in (slope_ds, rough_ds)):
                result = _unavailable(result_id, request, ["elevation, slope, and roughness rasters have mismatched grids"], source)
                _cache(result)
                return result
            elevation = dem.read(1).astype(np.float32, copy=False)
            slope = slope_ds.read(1).astype(np.float32, copy=False)
            roughness = rough_ds.read(1).astype(np.float32, copy=False)
            try:
                source_period = json.loads(dem.tags().get("source_period_utc", "null"))
            except json.JSONDecodeError:
                source_period = None
            source["source_period_utc"] = source_period
            valid = _valid_cells([elevation, slope, roughness], dem.nodata)
            start, goal = _coord_to_cell(dem, request.start), _coord_to_cell(dem, request.destination)
            if min(*start, *goal) < 0 or not valid[start] or not valid[goal]:
                result = _unavailable(result_id, request, ["start or destination falls on a NoData cell"], source)
                _cache(result)
                return result

            policy = _policy()
            policy_resolution_compatible = bool(policy and resolution <= float(policy["max_cell_resolution_km"]))
            blocked, policy_available = _policy_hazard_cells(slope, roughness, policy if policy_resolution_compatible else None)
            if request.avoid_policy_classified_high_hazards and policy_available:
                valid &= ~blocked
            base_weights = (request.slope_penalty_per_degree, request.roughness_penalty_per_meter)
            selected_weights = {
                "balanced": base_weights,
                "minimize_slope": (base_weights[0] * 2, base_weights[1] * 0.5),
                "minimize_roughness": (base_weights[0] * 0.5, base_weights[1] * 2),
            }[request.mission_objective]
            profiles = [(request.mission_objective, *selected_weights)]
            if request.alternative_count >= 1:
                profiles.append(("minimize_slope", base_weights[0] * 2, base_weights[1] * 0.5))
            if request.alternative_count >= 2:
                profiles.append(("minimize_roughness", base_weights[0] * 0.5, base_weights[1] * 2))
            routes = []
            route_cells: list[list[tuple[int, int]]] = []
            seen: set[tuple[tuple[int, int], ...]] = set()
            base_blocked = blocked if request.avoid_policy_classified_high_hazards else np.zeros_like(blocked)
            for objective, slope_weight, roughness_weight in profiles:
                route_blocked = base_blocked.copy()
                for prior_route in route_cells:
                    for cell in prior_route[1:-1]:
                        route_blocked[cell] = True
                cells = _astar(dem, slope, roughness, valid, route_blocked, start, goal, slope_weight, roughness_weight, request.maximum_slope_deg)
                if not cells or tuple(cells) in seen:
                    continue
                seen.add(tuple(cells))
                route_cells.append(cells)
                points = [_cell_lonlat(dem, row, col) for row, col in cells]
                requested_start = (_normalize_lon(request.start.longitude_deg), request.start.latitude_deg)
                requested_destination = (_normalize_lon(request.destination.longitude_deg), request.destination.latitude_deg)
                geometry_points = [requested_start, *points, requested_destination]
                distance_km = sum(_great_circle_km(geometry_points[i - 1], geometry_points[i]) for i in range(1, len(geometry_points)))
                slope_values = [float(slope[cell]) for cell in cells]
                rough_values = [float(roughness[cell]) for cell in cells]
                route_cost = sum(
                    _great_circle_km(points[i - 1], points[i]) * (
                        1.0 + slope_weight * (slope_values[i - 1] + slope_values[i]) / 2.0
                        + roughness_weight * (rough_values[i - 1] + rough_values[i]) / 2.0
                    )
                    for i in range(1, len(points))
                )
                encountered = [
                    {"latitude_deg": points[i][1], "longitude_deg": points[i][0], "severity": "policy-classified-high-or-critical"}
                    for i, cell in enumerate(cells) if blocked[cell]
                ]
                routes.append({
                    "route_id": str(uuid4()), "objective": objective,
                    "astronaut_id": request.astronaut_id,
                    "snapped_start": {"longitude_deg": points[0][0], "latitude_deg": points[0][1]},
                    "snapped_destination": {"longitude_deg": points[-1][0], "latitude_deg": points[-1][1]},
                    "geometry": _geojson_line(geometry_points),
                    "distance_km": distance_km,
                    "estimated_traversal_cost": "not calibrated; relative A* objective value only",
                    "cost_value": route_cost,
                    "terrain_summary": {
                        "maximum_slope_deg": max(slope_values), "mean_slope_deg": float(np.mean(slope_values)),
                        "maximum_roughness_m": max(rough_values), "mean_roughness_m": float(np.mean(rough_values)),
                    },
                    "encountered_hazards": encountered,
                    "risk_summary": "Known cited-policy high/critical cells were avoided." if policy_available and request.avoid_policy_classified_high_hazards else "Hazard classifications are unavailable; no hazard avoidance is claimed.",
                    "waypoint_count": len(points),
                })
            if not routes:
                result = _unavailable(result_id, request, ["no path found under the selected terrain constraints"], source)
                _cache(result)
                return result
            result = {
                "route_request_id": result_id, "status": "limited-assessment",
                "recommended_route": routes[0], "alternative_routes": routes[1:],
                "source": source, "request": request.model_dump(mode="json"),
                "risk_summary": "Terrain-weighted candidate route only. It is not a safe route, and available environmental hazard data may be incomplete.",
                "missing_information": [
                    "temperature, wind, dust, and radiation data are not connected to route costs",
                    *([] if policy_available else [
                        "validated hazard polygons or a reviewed, resolution-appropriate hazard policy"
                        if not policy else "configured hazard policy does not support this source resolution"
                    ]),
                ],
                "travel_time": None,
                "assumptions": [
                    "A* edge cost is distance multiplied by configurable slope and roughness penalties.",
                    "Penalty weights are user-selected preferences, not calibrated human mobility or survival risk.",
                    "No precise traversal time, astronaut safety, or mission-success probability is inferred.",
                    f"MOLA topography is historical and its {resolution:.3f} km sample is far coarser than local EVA terrain.",
                ],
                "policy_id": policy.get("policy_id") if policy else None,
            }
            _cache(result)
            return result
    except (OSError, ValueError, KeyError, TypeError, rasterio.errors.RasterioError) as error:
        raise RoutePlanningUnavailable(f"Could not use the selected processed terrain source: {error}") from error


def compare_routes(route_ids: list[str]) -> dict[str, Any]:
    routes = []
    missing = []
    for route_id in route_ids:
        result = get_route_result(route_id)
        if result is None:
            missing.append(route_id)
        elif result.get("recommended_route"):
            routes.append(result["recommended_route"])
        routes.extend(result.get("alternative_routes", []) if result else [])
    return {
        "status": "available" if routes and not missing else "insufficient-information",
        "routes": routes,
        "missing_route_request_ids": missing,
        "comparison_note": "Distances and relative terrain costs are comparable only when routes use the same source run and mission cost settings.",
    }


def route_planner_status() -> dict[str, Any]:
    run = _latest_route_terrain_run()
    if not run:
        return {"status": "unavailable", "source": None, "message": "No validated processed terrain is available."}
    _path, manifest = run
    resolution = float(manifest.get("pixel_resolution_m", {}).get("x", 0)) / 1000.0
    return {
        "status": "terrain-candidate-available" if resolution > 0 else "unavailable",
        "source": {"dataset_id": manifest.get("dataset_id", "mola"), "product_id": manifest.get("product_id"), "cell_resolution_km": resolution,
                   "processing_run": manifest.get("processing_run")},
        "route_generation": "requires a mission-specified maximum source cell size and compatible raster grid",
        "hazards": "unavailable without a reviewed cited classification policy or validated hazard geometries",
        "warning": "Terrain-cost candidates are not safe routes and do not produce travel-time estimates.",
    }
