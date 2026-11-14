from datetime import datetime, timezone

import pytest

from app.schemas.risk import RiskAssessmentRequest
from app.services import risk_assessment


def _request(period_end="2001-06-30T11:10:40Z"):
    start = datetime(1997, 9, 15, 19, 10, tzinfo=timezone.utc)
    end = datetime.fromisoformat(period_end.replace("Z", "+00:00"))
    return RiskAssessmentRequest.model_validate({
        "latitude_deg": 10,
        "longitude_deg": 0,
        "features": {
            "terrain_slope": {
                "value": 5, "units": "degree", "source_dataset": "test fixture",
                "source_product_id": "test-only", "observation_period_start": start,
                "observation_period_end": end, "resolution_km": 14.817845349,
            },
        },
    })


def _test_policy():
    return {
        "policy_id": "unit-test-only", "reference": "test fixture, not a scientific threshold",
        "rationale": "exercise policy handling only", "intended_use": "automated unit test",
        "max_cell_resolution_km": 20,
        "rules": [{
            "category": "terrain_slope", "units": "degree", "threshold": 1,
            "comparison": "gte", "severity": "high",
            "reference": "test fixture", "rationale": "exercise code path only",
        }],
    }


def test_no_model_or_policy_returns_unavailable_without_score_or_confidence(monkeypatch):
    monkeypatch.setattr(risk_assessment, "active_classification_policy", lambda: None)
    result = risk_assessment.assess_risk(_request())
    assert result["assessment_status"] == "unavailable"
    assert result["risk_classification"] == "unclassified"
    assert result["risk_score"] is None
    assert result["confidence"] is None
    assert result["model_version"] is None
    assert "validated and evaluated ML model" in " ".join(result["missing_inputs"])


def test_configured_rule_baseline_is_labeled_and_has_no_fake_numeric_score(monkeypatch):
    monkeypatch.setattr(risk_assessment, "active_classification_policy", _test_policy)
    result = risk_assessment.assess_risk(_request())
    assert result["assessment_status"] == "rule-based-limited"
    assert result["method"] == "configured-rule-baseline"
    assert result["risk_classification"] == "high"
    assert result["risk_score"] is None
    assert result["contributing_features"][0]["reference"] == "test fixture"
    assert result["feature_inputs"][0]["input_status"].startswith("client-supplied")


def test_mismatched_observation_periods_do_not_produce_combined_classification(monkeypatch):
    monkeypatch.setattr(risk_assessment, "active_classification_policy", _test_policy)
    request_data = _request().model_dump(mode="python")
    request_data["features"]["surface_roughness"] = {
        "value": 12, "units": "m", "source_dataset": "test fixture", "source_product_id": "test-only",
        "observation_period_start": "1997-09-15T19:10:00Z",
        "observation_period_end": "2000-06-30T11:10:40Z", "resolution_km": 14.817845349,
    }
    request = RiskAssessmentRequest.model_validate(request_data)
    result = risk_assessment.assess_risk(request)
    assert result["assessment_status"] == "unavailable"
    assert result["classification_status"] == "unclassified-temporal-mismatch"
    assert result["risk_classification"] == "unclassified"


def test_results_can_be_retrieved_from_bounded_memory_cache(monkeypatch):
    monkeypatch.setattr(risk_assessment, "active_classification_policy", lambda: None)
    result = risk_assessment.assess_risk(_request())
    assert risk_assessment.get_cached_assessment(result["assessment_id"]) == result


def test_units_and_observation_timezones_are_validated():
    data = {
        "latitude_deg": 0, "longitude_deg": 0,
        "features": {"terrain_slope": {
            "value": 5, "units": "m", "source_dataset": "fixture",
            "observation_period_start": "2020-01-01T00:00:00Z",
            "observation_period_end": "2020-01-02T00:00:00Z", "resolution_km": 1,
        }},
    }
    with pytest.raises(ValueError, match="units degree"):
        RiskAssessmentRequest.model_validate(data)
    data["features"]["terrain_slope"]["units"] = "degree"
    data["features"]["terrain_slope"]["observation_period_start"] = "2020-01-01T00:00:00"
    with pytest.raises(ValueError, match="timezone"):
        RiskAssessmentRequest.model_validate(data)
