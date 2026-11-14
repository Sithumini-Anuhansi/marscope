"""Transparent scientific environmental assessment; no ML risk labels are inferred."""

from __future__ import annotations

from typing import Any

from app.services.hazard_analysis import assess_location, service_status, summarize_region


def environmental_service_status() -> dict[str, Any]:
    return service_status()


def assess_environmental_location(latitude_deg: float, longitude_deg: float, categories: list[str] | None = None) -> dict[str, Any]:
    return assess_location(latitude_deg, longitude_deg, categories)


def assess_environmental_region(
    west_longitude_deg: float, south_latitude_deg: float,
    east_longitude_deg: float, north_latitude_deg: float,
    categories: list[str] | None = None,
) -> dict[str, Any]:
    return summarize_region(west_longitude_deg, south_latitude_deg, east_longitude_deg, north_latitude_deg, categories)
