"""Local reader for the USGS/IAU approved Mars nomenclature KMZ."""
from __future__ import annotations

import argparse
import json
import os
import tempfile
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from functools import lru_cache
from pathlib import Path

SOURCE_PAGE = "https://planetarynames.wr.usgs.gov/GIS_Downloads"
SOURCE_URL = "https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MARS_nomenclature_center_pts.kmz"
CATALOG_PATH = Path(__file__).resolve().parents[3] / "data" / "raw" / "planetary-names" / "MARS_nomenclature_center_pts.kmz"
KML_NS = {"k": "http://www.opengis.net/kml/2.2"}


def download_catalog(path: str | Path = CATALOG_PATH) -> dict:
    """Explicitly fetch the nightly USGS-hosted gazetteer; never downloads at app startup."""
    destination = Path(path).expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "MARSCOPE planetary feature map"})
    with urllib.request.urlopen(request, timeout=45) as response:
        with tempfile.NamedTemporaryFile("wb", dir=destination.parent, prefix=".mars-names-", delete=False) as tmp:
            temp_name = tmp.name
            size = 0
            while chunk := response.read(1024 * 1024):
                size += len(chunk)
                if size > 50 * 1024 * 1024:
                    raise ValueError("USGS gazetteer download exceeded 50 MiB safety limit")
                tmp.write(chunk)
    if size == 0:
        os.unlink(temp_name)
        raise ValueError("USGS gazetteer download was empty")
    os.replace(temp_name, destination)
    _load_catalog.cache_clear()
    return {"path": str(destination), "bytes": size, "source_url": SOURCE_URL}


def _field(placemark: ET.Element, name: str) -> str | None:
    for item in placemark.findall(".//k:SimpleData", KML_NS):
        if item.attrib.get("name") == name:
            return (item.text or "").strip()
    return None


@lru_cache(maxsize=1)
def _load_catalog() -> tuple[dict, ...]:
    if not CATALOG_PATH.is_file():
        raise FileNotFoundError(f"Mars Gazetteer is not downloaded. Run `python -m app.services.planetary_feature_catalog --download`; source: {SOURCE_PAGE}")
    with zipfile.ZipFile(CATALOG_PATH) as archive:
        kml_name = next((name for name in archive.namelist() if name.lower().endswith(".kml")), None)
        if not kml_name:
            raise ValueError("USGS KMZ contains no KML document")
        root = ET.fromstring(archive.read(kml_name))
    features = []
    for placemark in root.findall(".//k:Placemark", KML_NS):
        name_node = placemark.find("k:name", KML_NS)
        name = (name_node.text or "").strip() if name_node is not None else ""
        try:
            longitude = float(_field(placemark, "center_lon")) % 360
            latitude = float(_field(placemark, "center_lat"))
        except (TypeError, ValueError):
            continue
        if not name or not -90 <= latitude <= 90:
            continue
        diameter_raw = _field(placemark, "diameter")
        try:
            diameter = float(diameter_raw) if diameter_raw else None
        except ValueError:
            diameter = None
        features.append({
            "id": placemark.attrib.get("id", name), "name": name,
            "feature_type": _field(placemark, "type"), "diameter_km": diameter,
            "latitude_deg": latitude, "longitude_deg": longitude,
            "approval": _field(placemark, "approval") or "Adopted by IAU",
        })
    return tuple(features)


def _longitude_in_view(longitude_east: float, west: float, east: float) -> bool:
    longitude = (longitude_east + 180) % 360 - 180
    if abs(east - west) >= 360:
        return True
    west_n = (west + 180) % 360 - 180
    east_n = (east + 180) % 360 - 180
    if west_n <= east_n:
        return west_n <= longitude <= east_n
    return longitude >= west_n or longitude <= east_n


def query_named_features(west: float, south: float, east: float, north: float,
                         minimum_diameter_km: float = 0, limit: int = 600) -> dict:
    if not all(map(lambda value: isinstance(value, (int, float)), (west, south, east, north, minimum_diameter_km))):
        raise ValueError("Map bounds must be numeric")
    if not -90 <= south < north <= 90 or not 0 <= minimum_diameter_km <= 20000 or not 1 <= limit <= 2000:
        raise ValueError("Invalid latitude bounds, diameter filter, or result limit")
    features = [feature for feature in _load_catalog()
                if south <= feature["latitude_deg"] <= north
                and _longitude_in_view(feature["longitude_deg"], west, east)
                and (feature["diameter_km"] is None or feature["diameter_km"] >= minimum_diameter_km)]
    features.sort(key=lambda feature: (-(feature["diameter_km"] or 0), feature["name"].casefold()))
    total = len(features)
    return {
        "features": features[:limit], "count": min(total, limit), "matches_in_view": total,
        "truncated": total > limit,
        "source": {"organization": "USGS Astrogeology Science Center / IAU Working Group for Planetary System Nomenclature",
                   "page": SOURCE_PAGE, "dataset_url": SOURCE_URL,
                   "coordinate_system": "east longitude, planetocentric latitude; named feature center points",
                   "endorsement": "Data attribution only; NASA does not endorse the hosting provider or this application."},
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download the official USGS/IAU Mars feature-name gazetteer")
    parser.add_argument("--download", action="store_true", help="fetch and cache the latest USGS KMZ locally")
    args = parser.parse_args()
    if not args.download:
        parser.error("pass --download to fetch the named-feature catalog")
    print(json.dumps(download_catalog(), indent=2))
