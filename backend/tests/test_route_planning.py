import pytest

from app.schemas.route import MarsRoutePoint, RoutePlanningRequest
from app.services.route_planning_service import _geojson_line, generate_routes, route_planner_status


def _request(max_cell_km: float) -> RoutePlanningRequest:
    return RoutePlanningRequest(
        start=MarsRoutePoint(latitude_deg=0, longitude_deg=0),
        destination=MarsRoutePoint(latitude_deg=0.5, longitude_deg=0),
        maximum_source_cell_km=max_cell_km,
        slope_penalty_per_degree=0.05,
        roughness_penalty_per_meter=0.01,
        avoid_policy_classified_high_hazards=False,
        alternative_count=2,
    )


def test_route_planner_rejects_mola_when_resolution_exceeds_mission_limit():
    status = route_planner_status()
    if status["status"] == "unavailable":
        pytest.skip("No processed genuine MOLA sample is installed")

    result = generate_routes(_request(5.0))

    assert result["status"] == "unavailable"
    assert result["recommended_route"] is None
    assert result["alternative_routes"] == []
    assert any("14.8" in reason for reason in result["missing_information"])


def test_astar_returns_limited_route_candidates_from_real_mola(monkeypatch):
    status = route_planner_status()
    if status["status"] == "unavailable":
        pytest.skip("No processed genuine MOLA sample is installed")
    monkeypatch.delenv("MARSCOPE_HAZARD_POLICY_PATH", raising=False)

    result = generate_routes(_request(15.0))

    assert result["status"] == "limited-assessment"
    assert result["recommended_route"]["distance_km"] > 0
    assert result["recommended_route"]["geometry"]["type"] in {"LineString", "MultiLineString"}
    assert result["travel_time"] is None
    assert result["recommended_route"]["risk_summary"].startswith("Hazard classifications are unavailable")


def test_geojson_route_splits_antimeridian_crossing():
    geometry = _geojson_line([(179.5, 0), (-179.5, 1)])

    assert geometry["type"] == "MultiLineString"
    assert len(geometry["coordinates"]) == 2
    assert all(len(segment) == 2 for segment in geometry["coordinates"])
