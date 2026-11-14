"""Adapt validated scientific hazard measurements into provenance-carrying features."""

from __future__ import annotations

from typing import Any

from app.services.hazard_analysis import assess_location


def extract_environmental_features(latitude_deg: float, longitude_deg: float, categories: list[str] | None = None) -> dict[str, Any]:
    response = assess_location(latitude_deg, longitude_deg, categories)
    features = []
    for item in response.get("assessments", []):
        measurement = item.get("measurement")
        if item.get("observation_kind") != "derived" or measurement is None:
            continue
        features.append({
            "feature": item["category"],
            "value": measurement["value"],
            "units": measurement["units"],
            "method": item.get("methodology"),
            "source": item.get("source_dataset"),
            "data_quality": item.get("data_quality"),
            "uncertainty": item.get("uncertainty", "not quantified"),
        })
    return {
        "status": response.get("assessment_status", "insufficient-information"),
        "location": response.get("sampled_cell") or response.get("requested_location"),
        "processing_run": response.get("processing_run"),
        "features": features,
        "unavailable_categories": response.get("unavailable_categories", []),
        "message": response.get("message", "No validated environmental features are available."),
    }
