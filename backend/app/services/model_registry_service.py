"""Status-only registry summaries; candidate artifacts are never auto-loaded."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.services.risk_assessment import risk_service_status
from app.services.terrain_classifier_service import terrain_classifier_status

PROJECT_ROOT = Path(__file__).resolve().parents[3]


def list_ai_models() -> dict[str, Any]:
    terrain = terrain_classifier_status()
    risk = risk_service_status()
    return {
        "items": [
            {
                "component": "terrain-classification",
                "model_family": "AI4MARS semantic segmentation",
                "status": terrain["status"],
                "active_version": terrain["model_version"],
                "candidate_versions": terrain["candidate_versions"],
                "classes": terrain["classes"],
                "risk_labels": False,
                "message": terrain["message"],
            },
            {
                "component": "supervised-environmental-risk",
                "model_family": "future labeled-risk classifier",
                "status": "not-trained" if not risk["validated_model_available"] else risk["status"],
                "active_version": risk["model_version"],
                "candidate_manifests": risk["model_artifacts_found"],
                "message": "AI4MARS terrain material classes are not used as human risk labels.",
            },
            {
                "component": "unsupervised-terrain-patterns",
                "model_family": "K-Means, DBSCAN, Isolation Forest, PCA",
                "status": "experimental-pipeline-available" if _unsupervised_artifacts() else "not-run",
                "output_directory": "data/experimental/unsupervised",
                "operational_hazard_labels": False,
            },
        ],
        "models_are_loaded_on_status_read": False,
    }


def _unsupervised_artifacts() -> list[Path]:
    output = PROJECT_ROOT / "data" / "experimental" / "unsupervised"
    return sorted(output.glob("*/experiment-manifest.json")) if output.exists() else []


def ai_service_status() -> dict[str, Any]:
    models = list_ai_models()
    terrain = terrain_classifier_status()
    risk = risk_service_status()
    return {
        "status": "ready-with-limits",
        "components": {
            "terrain_classifier": terrain,
            "environmental_feature_engine": {"status": "mola-available-limited", "source": "processed MOLA product and reviewed optional policy"},
            "risk_synthesis": {"status": "available", "safe_unsafe_output": False},
            "supervised_risk_model": risk,
            "unsupervised_experiments": {"status": models["items"][2]["status"], "results_are_operational": False},
        },
        "limitations": [
            "Terrain model inference requires an explicitly reviewed local model.",
            "Environmental classifications require a cited, resolution-appropriate policy.",
            "No supervised human/mission-risk model is trained.",
            "Unsupervised results are exploratory and cannot be treated as hazards.",
        ],
    }
