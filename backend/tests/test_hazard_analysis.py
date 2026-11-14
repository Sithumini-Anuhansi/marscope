import pytest

pytest.importorskip("rasterio", reason="Install backend/requirements-geo.txt to test raster hazard analysis")

from app.services import hazard_analysis as hazards


def test_location_metrics_remain_unclassified_without_a_policy():
    result = hazards.assess_location(10, 0, ["terrain_slope", "surface_roughness", "temperature"])
    assert result["assessment_status"] == "limited-assessment"
    assert len(result["assessments"]) == 3
    slope, roughness, temperature = result["assessments"]
    assert slope["observation_kind"] == "derived"
    assert slope["severity"] == "unclassified"
    assert slope["classification"]["classification_status"] == "no-validated-policy"
    assert roughness["measurement"]["units"] == "m"
    assert temperature["observation_kind"] == "unavailable"
    assert result["hazard_features"]["features"] == []
    assert "not a safety decision" in result["message"]


def test_region_metrics_report_aggregates_but_no_hazard_polygons():
    result = hazards.summarize_region(-1, -1, 1, 1, ["elevation_variation"])
    assessment = result["assessments"][0]
    assert result["assessment_status"] == "limited-assessment"
    assert assessment["summary"]["sample_count"] > 0
    assert assessment["summary"]["maximum"] >= assessment["summary"]["minimum"]
    assert assessment["severity"] == "unclassified"
    assert result["hazard_features"]["features"] == []


def test_no_processed_data_is_reported_as_unassessed_not_safe(monkeypatch, tmp_path):
    monkeypatch.setattr(hazards, "PROCESSED_ROOT", tmp_path)
    result = hazards.assess_location(0, 0, ["terrain_slope"])
    assert result["assessment_status"] == "insufficient-information"
    assert result["assessments"] == []
    assert "not safe" in result["message"]


def test_zero_east_seam_region_is_split_into_two_raster_windows():
    segments = hazards._column_segments(-10, 10, 1440)
    assert len(segments) == 2
    assert segments[0][0] > segments[1][0]
    assert sum(end - start for start, end in segments) == 80


def test_configured_policy_is_required_and_resolution_checked():
    policy = {
        "policy_id": "test-policy", "reference": "test reference", "rationale": "test only",
        "intended_use": "unit test", "max_cell_resolution_km": 20,
        "rules": [{"category": "terrain_slope", "units": "degree", "threshold": 1,
                   "comparison": "gte", "severity": "high", "rationale": "test only",
                   "reference": "test reference"}],
    }
    result = hazards._classify("terrain_slope", 2, policy, "degree")
    assert result["severity"] == "high"
    assert result["classification_status"] == "classified-under-configured-policy"
    too_fine = {**policy, "max_cell_resolution_km": 1}
    result = hazards._classify("terrain_slope", 2, too_fine, "degree")
    assert result["severity"] == "unclassified"
    assert result["classification_status"] == "policy-incompatible-resolution"
