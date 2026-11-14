"""Fail-closed risk assessment: no model or probability is fabricated."""

from __future__ import annotations

import threading
import hashlib
import json
import math
import os
import re
from collections import OrderedDict
from datetime import timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.schemas.risk import FEATURE_UNITS, RiskAssessmentRequest
from app.services.hazard_analysis import (
    AVAILABLE_METRICS,
    HazardPolicyError,
    active_classification_policy,
    classify_terrain_metric,
)

PROJECT_ROOT = Path(__file__).resolve().parents[3]
MODEL_ROOT = PROJECT_ROOT / "ml-models"
MODEL_VERSION_ENV = "MARSCOPE_RISK_MODEL_VERSION"
_MODEL_VERSION_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
MAX_CACHED_ASSESSMENTS = 100
_ASSESSMENTS: OrderedDict[str, dict[str, Any]] = OrderedDict()
_LOCK = threading.Lock()
_MODEL_LOCK = threading.Lock()
_LOADED_MODEL: tuple[str, str, str, Any, dict[str, Any]] | None = None
SEVERITY_ORDER = {"low": 0, "moderate": 1, "high": 2, "critical": 3}


def _period_key(feature: Any) -> tuple[str, str]:
    start = feature.observation_period_start.astimezone(timezone.utc).isoformat()
    end = feature.observation_period_end.astimezone(timezone.utc).isoformat()
    return start, end


def _active_model_manifest() -> tuple[Path | None, dict[str, Any] | None, str | None]:
    version = os.getenv(MODEL_VERSION_ENV, "").strip()
    if not version:
        return None, None, f"Set {MODEL_VERSION_ENV} to an explicitly reviewed model version to enable inference."
    if not _MODEL_VERSION_PATTERN.fullmatch(version):
        return None, None, "Configured model version has an invalid format."
    model_dir = (MODEL_ROOT / version).resolve()
    if model_dir.parent != MODEL_ROOT.resolve():
        return None, None, "Configured model path is outside the model registry."
    manifest_path = model_dir / "model-manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None, None, f"No readable manifest exists for configured model version {version}."
    required = ("artifact_schema_version", "model_version", "model_file", "model_sha256", "deployment_status", "features", "feature_units", "target", "evaluation")
    required = (*required, "feature_resolution_km", "feature_sources", "spatial_coverage", "training_time_period_utc", "training_feature_ranges")
    if not isinstance(manifest, dict) or any(field not in manifest for field in required):
        return None, None, "Configured model manifest is incomplete."
    if manifest["artifact_schema_version"] != 1 or manifest["model_version"] != version:
        return None, None, "Configured model manifest version or schema does not match."
    if manifest["deployment_status"] != "approved":
        return None, None, "Configured model is a candidate; reviewer approval is required before inference."
    approval = manifest.get("model_approval", {})
    if not isinstance(approval, dict) or approval.get("status") != "approved" or not approval.get("reviewed_by"):
        return None, None, "Model manifest has no explicit model-review approval record."
    data = manifest.get("training_dataset", {})
    if not isinstance(data, dict) or data.get("review_status") != "approved-for-training" or not data.get("reviewed_by"):
        return None, None, "Model training data does not have the required review record."
    features = manifest.get("features")
    units = manifest.get("feature_units")
    if not isinstance(features, list) or not features or not isinstance(units, dict) or set(features) != set(units):
        return None, None, "Model feature names and units are invalid."
    if any(units.get(name) != FEATURE_UNITS.get(name) for name in features):
        return None, None, "Model feature units do not match the API feature contract."
    if set(manifest["feature_resolution_km"]) != set(features) or set(manifest["feature_sources"]) != set(features):
        return None, None, "Model feature resolution/source provenance is incomplete."
    for name in features:
        resolution = manifest["feature_resolution_km"].get(name)
        sources = manifest["feature_sources"].get(name)
        if not isinstance(resolution, dict) or not isinstance(sources, list) or not sources:
            return None, None, f"Model provenance for {name} is invalid."
        try:
            minimum, maximum = float(resolution["min"]), float(resolution["max"])
        except (KeyError, TypeError, ValueError):
            return None, None, f"Model resolution range for {name} is invalid."
        if not (0 < minimum <= maximum and math.isfinite(minimum) and math.isfinite(maximum)):
            return None, None, f"Model resolution range for {name} is invalid."
        if any(not isinstance(source, dict) or not source.get("source_dataset") or not source.get("source_product_id") for source in sources):
            return None, None, f"Model source registry for {name} is invalid."
    if any(name not in AVAILABLE_METRICS and name not in {"temperature", "wind_speed", "dust_opacity"} for name in features):
        return None, None, "Model manifest contains unsupported feature names."
    target = manifest.get("target")
    labels = target.get("class_labels") if isinstance(target, dict) else None
    if not isinstance(labels, list) or len(labels) < 2 or any(not isinstance(label, str) for label in labels) or not target.get("definition"):
        return None, None, "Model target definition or class labels are invalid."
    evaluation = manifest.get("evaluation")
    if not isinstance(evaluation, dict) or any(name not in evaluation for name in ("precision_macro", "recall_macro", "f1_macro", "confusion_matrix")):
        return None, None, "Model evaluation record is incomplete."
    coverage = manifest.get("spatial_coverage")
    period = manifest.get("training_time_period_utc")
    ranges = manifest.get("training_feature_ranges")
    if not isinstance(coverage, dict) or not isinstance(period, dict) or not isinstance(ranges, dict) or set(ranges) != set(features):
        return None, None, "Model training-domain metadata is incomplete."
    try:
        coverage_values = [float(coverage[name]) for name in ("latitude_min", "latitude_max", "longitude_min", "longitude_max")]
        training_start = datetime.fromisoformat(period["start"].replace("Z", "+00:00"))
        training_end = datetime.fromisoformat(period["end"].replace("Z", "+00:00"))
        range_values = [float(ranges[name][bound]) for name in features for bound in ("minimum", "maximum")]
    except (KeyError, TypeError, ValueError, AttributeError):
        return None, None, "Model training-domain metadata is invalid."
    if not all(math.isfinite(value) for value in [*coverage_values, *range_values]) or training_start.tzinfo is None or training_end.tzinfo is None or training_start > training_end:
        return None, None, "Model training-domain metadata is invalid."
    if not (-90 <= coverage_values[0] <= coverage_values[1] <= 90 and -180 <= coverage_values[2] <= coverage_values[3] <= 180):
        return None, None, "Model spatial coverage is invalid."
    if any(float(ranges[name]["minimum"]) > float(ranges[name]["maximum"]) for name in features):
        return None, None, "Model feature ranges are invalid."
    for name in features:
        manifest["feature_resolution_km"][name] = {
            "min": float(manifest["feature_resolution_km"][name]["min"]),
            "max": float(manifest["feature_resolution_km"][name]["max"]),
        }
        manifest["training_feature_ranges"][name] = {
            "minimum": float(ranges[name]["minimum"]),
            "maximum": float(ranges[name]["maximum"]),
        }
    manifest["spatial_coverage"] = dict(zip(("latitude_min", "latitude_max", "longitude_min", "longitude_max"), coverage_values))
    manifest["training_time_period_utc"] = {"start": training_start.isoformat(), "end": training_end.isoformat()}
    artifact_name = manifest.get("model_file", "")
    if not isinstance(artifact_name, str) or Path(artifact_name).name != artifact_name or not artifact_name.endswith(".joblib"):
        return None, None, "Model artifact path is invalid."
    if not isinstance(manifest.get("model_sha256"), str) or not re.fullmatch(r"[0-9a-f]{64}", manifest["model_sha256"]):
        return None, None, "Model artifact digest is invalid."
    artifact_path = (model_dir / artifact_name).resolve()
    if artifact_path.parent != model_dir or not artifact_path.is_file():
        return None, None, "Model artifact path is invalid or missing."
    try:
        digest = hashlib.sha256(artifact_path.read_bytes()).hexdigest()
    except OSError:
        return None, None, "Approved model artifact is missing."
    if digest != manifest.get("model_sha256"):
        return None, None, "Model artifact SHA-256 does not match its manifest."
    return artifact_path, manifest, None


def _load_active_model() -> tuple[Any, dict[str, Any]] | None:
    global _LOADED_MODEL
    artifact_path, manifest, error = _active_model_manifest()
    if error or artifact_path is None or manifest is None:
        return None
    manifest_digest = hashlib.sha256(json.dumps(manifest, sort_keys=True).encode("utf-8")).hexdigest()
    cache_key = (manifest["model_version"], manifest["model_sha256"], manifest_digest)
    with _MODEL_LOCK:
        if _LOADED_MODEL and _LOADED_MODEL[:3] == cache_key:
            return _LOADED_MODEL[3], _LOADED_MODEL[4]
        try:
            # Only load an explicitly selected, locally reviewed artifact whose digest matches its manifest.
            import joblib
            model = joblib.load(artifact_path)
        except Exception:
            return None
        _LOADED_MODEL = (*cache_key, model, manifest)
        return model, manifest


def risk_service_status() -> dict[str, Any]:
    model_manifests = list(MODEL_ROOT.glob("*/model-manifest.json")) if MODEL_ROOT.is_dir() else []
    _artifact_path, active_manifest, model_error = _active_model_manifest()
    policy = active_classification_policy()
    model_available = active_manifest is not None
    reasons = []
    if not model_available:
        reasons.append(model_error or "No approved model is registered.")
    if not model_manifests:
        reasons.append("No model candidates or approved model manifests are present.")
    reasons.append("No calibrated numerical risk score or confidence is available.")
    return {
        "status": "model-available" if model_available else "model-unavailable",
        "validated_model_available": model_available,
        "model_version": active_manifest.get("model_version") if active_manifest else None,
        "model_artifacts_found": len(model_manifests),
        "rule_based_baseline": "configured-cited-policy" if policy else "unavailable-no-classification-policy",
        "available_input_features": list(AVAILABLE_METRICS),
        "additional_possible_features": ["temperature", "wind_speed", "dust_opacity"],
        "score_available": False,
        "confidence_available": False,
        "active_model_features": active_manifest.get("features", []) if active_manifest else [],
        "reasons": reasons,
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


def _active_model_assessment(request: RiskAssessmentRequest) -> dict[str, Any] | None:
    loaded = _load_active_model()
    if loaded is None:
        return None
    model, manifest = loaded
    feature_names: list[str] = manifest["features"]
    missing = [name for name in feature_names if name not in request.features]
    supplied = [request.features[name] for name in feature_names if name in request.features]
    incompatibilities: list[str] = []
    if not supplied:
        incompatibilities.append("no model features were supplied")
    trained_missing = set(manifest.get("imputation", {}).get("missing_indicator_features_seen_during_training", []))
    if set(missing) - trained_missing:
        incompatibilities.append("missing model features were not represented during training: " + ", ".join(sorted(set(missing) - trained_missing)))
    for name in feature_names:
        feature = request.features.get(name)
        if feature is None:
            continue
        resolution = manifest["feature_resolution_km"].get(name, {})
        if not resolution.get("min", 0) <= feature.resolution_km <= resolution.get("max", 0):
            incompatibilities.append(f"{name} resolution is outside the model's reviewed data range")
        source_pairs = manifest["feature_sources"].get(name, [])
        pair = {"source_dataset": feature.source_dataset, "source_product_id": feature.source_product_id}
        if pair not in source_pairs:
            incompatibilities.append(f"{name} source/product is not registered for this model")
    coverage = manifest.get("spatial_coverage", {})
    longitude = ((request.longitude_deg + 180.0) % 360.0) - 180.0
    if coverage and not (
        coverage.get("latitude_min", -90) <= request.latitude_deg <= coverage.get("latitude_max", 90)
        and coverage.get("longitude_min", -180) <= longitude <= coverage.get("longitude_max", 180)
    ):
        incompatibilities.append("requested location is outside the model's documented training coverage")
    period = manifest.get("training_time_period_utc", {})
    if period and supplied:
        training_start = datetime.fromisoformat(period["start"].replace("Z", "+00:00"))
        training_end = datetime.fromisoformat(period["end"].replace("Z", "+00:00"))
        if any(
            item.observation_period_start.astimezone(timezone.utc) < training_start
            or item.observation_period_end.astimezone(timezone.utc) > training_end
            for item in supplied
        ):
            incompatibilities.append("input observation period is outside the model's documented training period")
    periods = {_period_key(request.features[name]) for name in feature_names if name in request.features}
    if len(periods) > 1:
        incompatibilities.append("model input feature periods are not temporally aligned")
    ranges = manifest.get("training_feature_ranges", {})
    out_of_range = [
        name for name in feature_names if name in request.features and name in ranges
        and not ranges[name]["minimum"] <= request.features[name].value <= ranges[name]["maximum"]
    ]
    if out_of_range:
        incompatibilities.append(f"input outside training feature range: {', '.join(out_of_range)}")

    missing_inputs = [f"model feature not supplied: {name}" for name in missing]
    missing_inputs.extend(incompatibilities)
    base = {
        "assessment_id": str(uuid4()),
        "location": {
            "latitude_deg": request.latitude_deg,
            "longitude_deg": longitude,
            "latitude_type": request.latitude_type,
            "longitude_direction": request.longitude_direction,
        },
        "method": "validated-ml-model",
        "model_version": manifest["model_version"],
        "risk_score": None,
        "risk_score_meaning": None,
        "score_unavailable_reason": "The registered model has no validated probability calibration or score definition.",
        "confidence": None,
        "uncertainty": "No calibrated prediction uncertainty is registered.",
        "policy_id": None,
        "policy_reference": None,
        "survival_or_mission_success_probability": None,
        "feature_location_status": "Location is checked against the model's documented bounding coverage; supplied feature provenance is caller-asserted.",
        "feature_inputs": [
            {
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
                "rule_classification": {"classification_status": "not-applicable-ml-model"},
            }
            for name, feature in request.features.items()
        ],
        "contributing_features": [],
        "model_feature_importance": manifest.get("evaluation", {}).get("global_permutation_importance", []),
        "missing_inputs": missing_inputs,
        "persistence": "Assessment cached in process memory only; lost on API restart and capped at 100 entries.",
    }
    if incompatibilities:
        return {
            **base,
            "assessment_status": "unavailable",
            "risk_classification": "unclassified",
            "classification_status": "model-input-outside-validated-domain",
            "explanation": "The input is outside the model's reviewed time, feature, or spatial domain, so no prediction was made.",
        }
    try:
        import pandas as pd
        import numpy as np

        row = {
            name: [request.features[name].value if name in request.features else np.nan]
            for name in feature_names
        }
        prediction = str(model.predict(pd.DataFrame(row))[0])
    except Exception as error:
        return {
            **base,
            "assessment_status": "unavailable",
            "risk_classification": "unclassified",
            "classification_status": "model-inference-failed",
            "missing_inputs": [*missing_inputs, f"model inference failed: {type(error).__name__}"],
            "explanation": "The registered model could not produce a prediction; no result was inferred.",
        }
    classes = set(map(str, manifest["target"].get("class_labels", [])))
    if prediction not in classes:
        return {
            **base,
            "assessment_status": "unavailable",
            "risk_classification": "unclassified",
            "classification_status": "model-output-schema-mismatch",
            "explanation": "The model output does not match its registered class labels; no result was returned.",
        }
    return {
        **base,
        "assessment_status": "model-prediction-limited",
        "risk_classification": prediction,
        "classification_status": "validated-model-classification",
        "explanation": (
            f"Model output for the reviewed target '{manifest['target']['definition']}'. "
            + ("Missing input features were median-imputed using training-split statistics. " if missing else "")
            + "Global permutation importance is shown separately and does not explain this individual prediction."
        ),
    }


def assess_risk(request: RiskAssessmentRequest) -> dict[str, Any]:
    model_assessment = _active_model_assessment(request)
    if model_assessment is not None:
        _cache(model_assessment)
        return model_assessment

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
