"""Mars coordinate helpers; source latitude type must always be explicit."""

from __future__ import annotations

import math
from typing import Any


def normalize_east_longitude(longitude_deg: float) -> float:
    """Wrap positive-east longitude to GeoJSON's conventional [-180, 180) range."""
    if not math.isfinite(longitude_deg):
        raise ValueError("longitude must be finite")
    return (longitude_deg + 180.0) % 360.0 - 180.0


def validate_planetocentric(latitude_deg: float, longitude_deg: float) -> tuple[float, float]:
    """Validate planetocentric latitude and return (latitude, wrapped east longitude)."""
    if not math.isfinite(latitude_deg) or not -90.0 <= latitude_deg <= 90.0:
        raise ValueError("planetocentric latitude must be finite and in [-90, 90]")
    return latitude_deg, normalize_east_longitude(longitude_deg)


def raster_cell_center(row: int, column: int, *, height: int = 720, width: int = 1440) -> tuple[float, float]:
    """Return (east longitude, planetocentric latitude) at the cell center."""
    if not (0 <= row < height and 0 <= column < width):
        raise IndexError("raster cell is outside the supplied dimensions")
    latitude = 90.0 - (row + 0.5) * (180.0 / height)
    longitude_east_360 = (column + 0.5) * (360.0 / width)
    return normalize_east_longitude(longitude_east_360), latitude


def point_feature(longitude_deg: float, latitude_deg: float, properties: dict[str, Any] | None = None) -> dict[str, Any]:
    """Create a GeoJSON point while recording its planetary coordinate convention."""
    latitude, longitude = validate_planetocentric(latitude_deg, longitude_deg)
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [longitude, latitude]},
        "properties": {"latitude_type": "planetocentric", "longitude_direction": "positive-east", **(properties or {})},
    }
