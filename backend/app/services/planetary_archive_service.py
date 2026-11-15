"""Live, footprint-aware product discovery for public Mars PDS archives.

ODE records include PDS product identifiers, dates, coverage, and archive file
links. Browse images are visual context only; this service does not reinterpret
raw or calibrated instrument data as a safety measurement.
"""

from __future__ import annotations

import json
import math
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ODE_URL = "https://oderest.rsl.wustl.edu/live2"
MARS_RADIUS_KM = 3389.5
DEGREE_KM = math.pi * MARS_RADIUS_KM / 180.0
CACHE_TTL_SECONDS = 900
MAX_PRODUCTS_PER_SOURCE = 3
REQUEST_TIMEOUT_SECONDS = 12

ARCHIVE_SOURCES: dict[str, dict[str, str]] = {
    "themis": {
        "name": "THEMIS IR-GEO v2",
        "mission_id": "ODY",
        "instrument_id": "THEMIS",
        "product_type": "IRGEO2",
        "dataset_id": "ODY-M-THM-5-IRGEO-V2.0",
        "data_kind": "Registered and atmospherically corrected calibrated radiance imagery",
        "caveat": "Historical orbital radiance imagery; values are not surface temperature unless a calibrated brightness-temperature product is selected and processed.",
    },
    "ctx": {
        "name": "CTX EDR",
        "mission_id": "MRO",
        "instrument_id": "CTX",
        "product_type": "EDR",
        "dataset_id": "MRO-M-CTX-2-EDR-L0-V1.0",
        "data_kind": "Single-camera grayscale image products",
        "caveat": "PDS EDR imagery is minimally processed; use map-projected products or a validated mosaic for aligned overlays.",
    },
    "hirise": {
        "name": "HiRISE DTM",
        "mission_id": "MRO",
        "instrument_id": "HIRISE",
        "product_type": "DTM",
        "dataset_id": "MRO-M-HIRISE-5-DTM-V1.0",
        "data_kind": "Stereo-derived map-projected elevation raster",
        "caveat": "Local coverage only. DTM browse imagery is a preview; use the labeled elevation product and its map projection for terrain measurements.",
    },
    "crism": {
        "name": "CRISM targeted TRDR",
        "mission_id": "MRO",
        "instrument_id": "CRISM",
        "product_type": "TRDR",
        "dataset_id": "MRO-M-CRISM-3-RDR-TARGETED-V1.0",
        "data_kind": "Targeted hyperspectral reduced data record",
        "caveat": "Spectral/compositional evidence; not a hazard or safety label. Browse images are not spectral measurements.",
    },
    "sharad": {
        "name": "SHARAD RDR",
        "mission_id": "MRO",
        "instrument_id": "SHARAD",
        "product_type": "RDR",
        "dataset_id": "MRO-M-SHARAD-4-RDR-V1.0",
        "data_kind": "Orbital subsurface radar sounding products",
        "caveat": "Track-based subsurface evidence; a return is not proof of accessible water ice.",
    },
}

_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_cache_lock = threading.Lock()
_executor = ThreadPoolExecutor(max_workers=5, thread_name_prefix="mars-pds-ode")


def _normalise_products(raw: Any) -> list[dict[str, Any]]:
    if raw is None:
        return []
    return raw if isinstance(raw, list) else [raw]


def _normalise_files(raw: Any) -> list[dict[str, Any]]:
    if raw is None:
        return []
    files = raw if isinstance(raw, list) else [raw]
    return [item for item in files if isinstance(item, dict)]


def _optional_float(value: Any) -> float | None:
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def _query_source(source_id: str, source: dict[str, str], bounds: dict[str, float]) -> dict[str, Any]:
    params = {
        "query": "products",
        "results": "fmp",
        "output": "JSON",
        "target": "mars",
        "ihid": source["mission_id"],
        "iid": source["instrument_id"],
        "pt": source["product_type"],
        "minlat": f"{bounds['south']:.6f}",
        "maxlat": f"{bounds['north']:.6f}",
        "westernlon": f"{bounds['west']:.6f}",
        "easternlon": f"{bounds['east']:.6f}",
        "limit": str(MAX_PRODUCTS_PER_SOURCE),
    }
    request = Request(f"{ODE_URL}?{urlencode(params)}", headers={"User-Agent": "MARSCOPE/1.0 scientific product discovery"})
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
        result = payload.get("ODEResults", {})
        if result.get("Status") != "Success":
            return {
                "id": source_id, "name": source["name"], "status": "source-error",
                "product_count": 0, "products": [], "message": result.get("Error", "ODE did not return a successful query."),
                "source_url": f"https://ode.rsl.wustl.edu/mars/productSearch.aspx",
            }
        records = _normalise_products(result.get("Products", {}).get("Product"))
        products = []
        for record in records[:MAX_PRODUCTS_PER_SOURCE]:
            files = _normalise_files(record.get("Product_files", {}).get("Product_file"))
            browse = next((item for item in files if item.get("Type", "").lower() == "browse" and str(item.get("URL", "")).lower().endswith((".jpg", ".jpeg", ".png"))), None)
            primary = next((item for item in files if item.get("Type", "").lower() == "product"), None)
            products.append({
                "product_id": record.get("pdsid") or record.get("LID") or record.get("Product_Lid"),
                "dataset_id": record.get("Data_Set_Id") or source["dataset_id"],
                "product_type": record.get("pt") or source["product_type"],
                "observation_time": record.get("Observation_time") or record.get("Observation_start_time") or record.get("Observation_Time_Start"),
                "creation_time": record.get("Product_creation_time"),
                "center_latitude_deg": _optional_float(record.get("Center_latitude")),
                "center_longitude_deg": _optional_float(record.get("Center_longitude")),
                "minimum_latitude_deg": _optional_float(record.get("Minimum_latitude")),
                "maximum_latitude_deg": _optional_float(record.get("Maximum_latitude")),
                "western_longitude_deg": _optional_float(record.get("Westernmost_longitude")),
                "eastern_longitude_deg": _optional_float(record.get("Easternmost_longitude")),
                "map_scale_m_per_pixel": _optional_float(record.get("Map_scale")),
                "footprint_wkt": record.get("Footprint_geometry"),
                "browse_url": browse.get("URL") if browse else None,
                "product_url": primary.get("URL") if primary else None,
                "product_url_label": primary.get("FileName") if primary else None,
                "product_url_kb": primary.get("KBytes") if primary else None,
                "detail_url": record.get("ProductURL") or "https://ode.rsl.wustl.edu/mars/productSearch.aspx",
            })
        count_value = result.get("Count", len(products))
        try:
            total = int(count_value)
        except (TypeError, ValueError):
            total = len(products)
        return {
            "id": source_id,
            "name": source["name"],
            "status": "products-found" if total else "no-coverage",
            "dataset_id": source["dataset_id"],
            "product_type": source["product_type"],
            "data_kind": source["data_kind"],
            "caveat": source["caveat"],
            "product_count": total,
            "products": products,
            "source_url": "https://ode.rsl.wustl.edu/",
        }
    except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError) as error:
        return {
            "id": source_id, "name": source["name"], "status": "source-unreachable",
            "product_count": 0, "products": [], "message": str(error),
            "source_url": "https://ode.rsl.wustl.edu/",
        }


def discover_products(latitude_deg: float, longitude_deg: float, radius_km: float) -> dict[str, Any]:
    """Return actual ODE products intersecting a circular study-area bounding box."""
    longitude = longitude_deg % 360.0
    latitude_delta = radius_km / DEGREE_KM
    longitude_scale = max(0.15, math.cos(math.radians(latitude_deg)))
    longitude_delta = min(180.0, radius_km / (DEGREE_KM * longitude_scale))
    bounds = {
        "south": max(-90.0, latitude_deg - latitude_delta),
        "north": min(90.0, latitude_deg + latitude_delta),
        "west": (longitude - longitude_delta) % 360.0,
        "east": (longitude + longitude_delta) % 360.0,
    }
    # ODE handles conventional west/east ranges; split only if the radius crosses 0°.
    cache_key = json.dumps([round(latitude_deg, 5), round(longitude, 5), round(radius_km, 2)], separators=(",", ":"))
    now = time.monotonic()
    with _cache_lock:
        cached = _cache.get(cache_key)
        if cached and now - cached[0] < CACHE_TTL_SECONDS:
            return cached[1]

    west_unwrapped = longitude - longitude_delta
    east_unwrapped = longitude + longitude_delta
    query_bounds = []
    if west_unwrapped < 0:
        query_bounds = [
            {**bounds, "west": 0.0, "east": east_unwrapped},
            {**bounds, "west": 360.0 + west_unwrapped, "east": 360.0},
        ]
    elif east_unwrapped >= 360:
        query_bounds = [
            {**bounds, "west": west_unwrapped, "east": 360.0},
            {**bounds, "west": 0.0, "east": east_unwrapped - 360.0},
        ]
    else:
        query_bounds = [bounds]

    def query_entry(entry: tuple[str, dict[str, str]]) -> dict[str, Any]:
        source_id, source = entry
        results = [_query_source(source_id, source, query_box) for query_box in query_bounds]
        products_by_id: dict[str, dict[str, Any]] = {}
        for result in results:
            for product in result.get("products", []):
                if product.get("product_id"):
                    products_by_id[product["product_id"]] = product
        first = results[0]
        if len(results) > 1:
            first = dict(first)
            first["products"] = list(products_by_id.values())[:MAX_PRODUCTS_PER_SOURCE]
            first["product_count"] = sum(item.get("product_count", 0) for item in results)
            first["status"] = "products-found" if first["product_count"] else first["status"]
        return first

    futures = [_executor.submit(query_entry, entry) for entry in ARCHIVE_SOURCES.items()]
    items = [future.result(timeout=REQUEST_TIMEOUT_SECONDS * len(query_bounds) + 2) for future in futures]
    response = {
        "provider": "NASA Planetary Data System Geosciences Node Mars Orbital Data Explorer (ODE)",
        "provider_url": "https://ode.rsl.wustl.edu/",
        "query_location": {"latitude_deg": latitude_deg, "longitude_deg": longitude, "latitude_type": "areocentric", "longitude_direction": "positive-east"},
        "query_radius_km": radius_km,
        "bounds": bounds,
        "query_time_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "cache_ttl_seconds": CACHE_TTL_SECONDS,
        "items": items,
        "limitations": [
            "ODE products are archive observations whose footprints intersect the search box; they are not all from the same date.",
            "Browse images are previews. Scientific values require the original PDS product labels and product-specific processing.",
            "A product match does not imply continuous coverage, current conditions, or a safety classification.",
        ],
    }
    with _cache_lock:
        _cache[cache_key] = (now, response)
    return response
