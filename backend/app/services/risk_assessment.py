"""Fail-closed risk assessment: no model or probability is fabricated."""

from __future__ import annotations

import threading
from collections import OrderedDict
from datetime import timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.schemas.risk import RiskAssessmentRequest
from app.services.hazard_analysis import (
    AVAILABLE_METRICS,
    HazardPolicyError,
    active_classification_policy,
    classify_terrain_metric,
)

PROJECT_ROOT = Path(__file__).resolve().parents[3]
MODEL_ROOT = PROJECT_ROOT / "ml-models"
MAX_CACHED_ASSESSMENTS = 100
_ASSESSMENTS: OrderedDict[str, dict[str, Any]] = OrderedDict()
_LOCK = threading.Lock()
SEVERITY_ORDER = {"low": 0, "moderate": 1, "high": 2, "critical": 3}


def _period_key(feature: Any) -> tuple[str, str]:
    start = feature.observation_period_start.astimezone(timezone.utc).isoformat()
    end = feature.observation_period_end.astimezone(timezone.utc).isoformat()
    return start, end


def risk_service_status() -> dict[str, Any]:
    model_manifests = list(MODEL_ROOT.glob("*/model-manifest.json")) if MODEL_ROOT.is_dir() else []
    policy = active_classification_policy()
    return {
        "status": "model-unavailable",
        "validated_model_available": False,
        "model_version": None,
        "model_artifacts_found": len(model_manifests),
        "rule_based_baseline": "configured-cited-policy" if policy else "unavailable-no-classification-policy",
        "available_input_features": list(AVAILABLE_METRICS),
        "additional_possible_features": ["temperature", "wind_speed", "dust_opacity"],
        "score_available": False,
        "confidence_available": False,
        "reasons": [
            "No validated ML model is registered.",
            "No labeled Mars exploration risk training dataset is registered.",
            "No calibrated numerical risk-score definition is available.",
        ],
        "model_manifests_are_not_loaded": True,
    }


def _cache(assessment: dict[str, Any]) -> None:
    with _LOCK:
        _ASSESSMENTS[assessment["assessment_id"]] = assessment
        _ASSESSMENTS.move_to_end(assessment["assessment_id"])
        while len(_ASSESSMENTS) > MAX_CACHED_ASSESSMENTS:
            _ASSESSMENTS.popitem(last=False)


def get_cached_assessment(assessment_id: str) -> dict[str, Any] | None:
    with _LOCK:
        assessment = _ASSESSMENTS.get(assessment_id)
        if assessment is not None:
            _ASSESSMENTS.move_to_end(assessment_id)
        return assessment


def assess_risk(request: RiskAssessmentRequest) -> dict[str, Any]:
    policy = active_classification_policy()
    candidate_features: list[dict[str, Any]] = []
    missing_inputs = [
        "validated labeled Mars risk dataset",
        "validated and evaluated ML model",
        "calibrated score definition",
    ]
    if not policy:
        missing_inputs.append("documented classification policy for a rule-based baseline")
    expected_features = {"terrain_slope", "surface_roughness", "elevation_variation", "temperature", "wind_speed", "dust_opacity"}
    for feature_name in sorted(expected_features - set(request.features)):
        missing_inputs.append(f"feature not supplied: {feature_name}")

    terrain_names = set(AVAILABLE_METRICS)
    provided_terrain = [(name, feature) for name, feature in request.features.items() if name in terrain_names]
    periods = {_period_key(feature) for _, feature in provided_terrain}
    temporal_alignment = len(periods) <= 1
    if len(periods) > 1:
        missing_inputs.append("temporally aligned terrain features; supplied observation periods differ")

    for name, feature in request.features.items():
        entry: dict[str, Any] = {
            "feature": name,
            "value": feature.value,
            "units": feature.units,
            "source_dataset": feature.source_dataset,
            "source_product_id": feature.source_product_id,
            "observation_period_utc": [
                feature.observation_period_start.astimezone(timezone.utc).isoformat(),
                feature.observation_period_end.astimezone(timezone.utc).isoformat(),
            ],
            "resolution_km": feature.resolution_km,
            "input_status": "client-supplied; source not independently verified",
            "rule_classification": {"status": "unavailable-no-matching-policy"},
        }
        if policy and name in terrain_names:
            max_resolution = float(policy["max_cell_resolution_km"])
            if feature.resolution_km > max_resolution:
                rule = {"severity": "unclassified", "classification_status": "policy-incompatible-resolution"}
            else:
                rule = classify_terrain_metric(name, feature.value, feature.units, policy=policy)
            entry["rule_classification"] = rule
        candidate_features.append(entry)

    classified = [
        item for item in candidate_features
        if item["rule_classification"].get("classification_status") == "classified-under-configured-policy"
    ]
    if policy and not temporal_alignment:
        classification_status = "unclassified-temporal-mismatch"
        risk_classification = "unclassified"
        contributing_features: list[dict[str, Any]] = []
        missing_inputs.append("temporal registration across all features used for a combined baseline")
    elif classified:
        classification_status = "rule-based-classification"
        worst = max(classified, key=lambda item: SEVERITY_ORDER[item["rule_classification"]["severity"]])
        risk_classification = worst["rule_classification"]["severity"]
        contributing_features = [
            {"feature": item["feature"], "value": item["value"], "units": item["units"],
             "rule": item["rule_classification"].get("applied_rule"),
             "reference": item["rule_classification"].get("policy_reference"),
             "rationale": item["rule_classification"].get("policy_rationale")}
            for item in classified
        ]
    else:
        classification_status = "unavailable-no-validated-model-or-matching-rule"
        risk_classification = "unclassified"
        contributing_features = []

    method = "configured-rule-baseline" if classified and temporal_alignment else "unavailable"
    assessment = {
        "assessment_id": str(uuid4()),
        "assessment_status": "rule-based-limited" if method == "configured-rule-baseline" else "unavailable",
        "location": {
            "latitude_deg": request.latitude_deg,
            "longitude_deg": ((request.longitude_deg + 180.0) % 360.0) - 180.0,
            "latitude_type": request.latitude_type,
            "longitude_direction": request.longitude_direction,
        },
        "method": method,
        "risk_classification": risk_classification,
        "classification_status": classification_status,
        "risk_score": None,
        "risk_score_meaning": None,
        "score_unavailable_reason": "No calibrated, validated numerical risk score model is available.",
        "contributing_features": contributing_features,
        "feature_inputs": candidate_features,
        "feature_location_status": "client asserts features correspond to the requested location; not independently verified",
        "explanation": (
            "Classification is the highest severity among matching, referenced rules. It is a limited rule-based baseline, not an ML prediction."
            if method == "configured-rule-baseline" else
            "Risk prediction is unavailable. Submitted measurements are not interpreted as a risk result."
        ),
        "model_version": None,
        "confidence": None,
        "uncertainty": "not quantified; no validated model or calibration is available",
        "missing_inputs": sorted(set(missing_inputs)),
        "policy_id": policy["policy_id"] if policy and classified else None,
        "policy_reference": policy["reference"] if policy and classified else None,
        "survival_or_mission_success_probability": None,
        "persistence": "assessment results are cached in memory only; lost on API restart and capped at 100 entries",
    }
    _cache(assessment)
    return assessment
