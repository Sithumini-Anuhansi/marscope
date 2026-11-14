from fastapi import APIRouter, HTTPException

from app.schemas.route import RouteComparisonRequest, RoutePlanningRequest
from app.services.route_planning_service import (
    RoutePlanningUnavailable,
    compare_routes,
    generate_routes,
    get_route_result,
    route_planner_status,
)

router = APIRouter(prefix="/routes", tags=["route planning"])


@router.get("/status", summary="Report route-planning data readiness")
def get_route_status():
    return route_planner_status()


@router.post("/generate", summary="Generate terrain-cost route candidates")
def create_routes(request: RoutePlanningRequest):
    try:
        return generate_routes(request)
    except RoutePlanningUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except (OSError, ValueError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/compare", summary="Compare recently generated route requests")
def compare_route_requests(request: RouteComparisonRequest):
    return compare_routes(request.route_ids)


@router.get("/{route_request_id}", summary="Retrieve a generated route request")
def read_route_request(route_request_id: str):
    result = get_route_result(route_request_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Route request was not found in the in-memory result cache")
    return result
