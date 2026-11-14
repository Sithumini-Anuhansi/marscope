"""Combine independent terrain, science, observations, and constraints transparently."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from app.schemas.ai import AISynthesisRequest
from app.services.environmental_risk_service import assess_environmental_location
from app.services.terrain_classifier_service import get_terrain_assessment


def synthesize_risk_assessment(request: AISynthesisRequest) -> dict[str, Any]:
    environment = assess_environmental_location(request.latitude_deg, request.longitude_deg, request.categories)
    terrain = get_terrain_assessment(request.terrain_assessment_id) if request.terrain_assessment_id else None
    assessments = environment.get("assessments", [])
    rule_derived = [
        {
            "category": item.get("category"),
            "severity": item.get("severity"),
            "classification": item.get("classification"),
            "measurement": item.get("measurement"),
            "source_dataset": item.get("source_dataset"),
            "methodology": item.get("methodology"),
        }
        for item in assessments
        if item.get("classification", {}).get("classification_status") == "classified-under-configured-policy"
    ]
    missing = []
    if not environment.get("features"):
        missing.append("processed, validated environmental features for the requested location")
    missing.extend(f"validated source data unavailable: {name}" for name in environment.get("unavailable_categories", []))
    if not terrain:
        missing.append("AI4MARS image classification for this assessment (optional and not an environmental risk label)")
    if environment.get("status") == "insufficient-information":
        missing.append("operational environmental risk inputs")
    if not rule_derived:
        missing.append("reviewed resolution-appropriate classification policy")

    return {
        "assessment_id": str(uuid4()),
        "assessment_status": "rule-based-limited" if rule_derived else "insufficient-information",
        "overall_assessment": "unclassified",
        "overall_assessment_reason": "No definitive safe/unsafe decision is produced. Terrain classes and unclassified measurements do not establish mission safety.",
        "location": {
            "latitude_deg": request.latitude_deg,
            "longitude_deg": ((request.longitude_deg + 180.0) % 360.0) - 180.0,
            "latitude_type": "planetocentric",
            "longitude_direction": "positive-east",
        },
        "environmental_indicators": assessments,
        "terrain_classification": {
            "status": "available" if terrain else "unavailable",
            "assessment": terrain,
            "risk_label_mapping": "none; AI4MARS material classes are not hazard labels",
        },
        "rule_derived_indicators": rule_derived,
        "crew_observations": [
            {**observation.model_dump(), "validation_status": "user-supplied; unverified"}
            for observation in request.crew_observations
        ],
        "mission_constraints": [
            {"text": constraint, "validation_status": "user-supplied; not evaluated by a mission model"}
            for constraint in request.mission_constraints
        ],
        "contributing_factors": [
            {"category": item["category"], "kind": "rule-derived indicator", "severity": item["severity"],
             "reference": item.get("classification", {}).get("policy_reference"),
             "rationale": item.get("classification", {}).get("policy_rationale")}
            for item in rule_derived
        ],
        "data_sources": [item.get("source_dataset") for item in assessments if item.get("source_dataset")],
        "data_quality": [item.get("data_quality") for item in assessments if item.get("data_quality")],
        "uncertainty": "MOLA uncertainty is not quantified by its source product or this processing pipeline. Terrain segmentation softmax, when present, is not calibrated.",
        "missing_information": sorted(set(missing)),
        "explanation": (
            "Any displayed severity is produced only by the configured, cited rule policy. AI4MARS terrain segmentation is shown as independent visual context and does not determine hazard severity."
            if rule_derived else
            "Available measurements are contextual only. No reviewed hazard policy or sufficient environmental evidence supports a classified risk assessment."
        ),
        "risk_model": {"status": "not-trained", "risk_prediction": None, "risk_score": None, "confidence": None},
        "survival_or_mission_success_probability": None,
    }
