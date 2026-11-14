from fastapi import APIRouter, HTTPException, Query

from app.services.hazard_analysis import (
    HazardPolicyError,
    assess_location,
    service_status,
    summarize_region,
)

router = APIRouter(prefix="/hazards", tags=["hazards"])


def _categories(value: str | None) -> list[str] | None:
    return [category.strip() for category in value.split(",") if category.strip()] if value else None


@router.get("/status", summary="Report available hazard-analysis inputs")
def get_hazard_service_status():
    try:
        return service_status()
    except (OSError, ValueError, HazardPolicyError) as error:
        raise HTTPException(status_code=503, detail=f"Hazard service configuration is invalid: {error}") from error


@router.get("/location", summary="Assess available terrain metrics at a Mars location")
def get_location_assessment(
    latitude_deg: float = Query(ge=-90, le=90, description="Planetocentric latitude in degrees"),
    longitude_deg: float = Query(description="Positive-east longitude in degrees; any equivalent wrap is accepted"),
    categories: str | None = Query(default=None, description="Comma-separated hazard categories; omit for all categories"),
):
    try:
        return assess_location(latitude_deg, longitude_deg, _categories(categories))
    except HazardPolicyError as error:
        raise HTTPException(status_code=503, detail=f"Hazard policy is invalid: {error}") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except OSError as error:
        raise HTTPException(status_code=503, detail=f"Hazard assessment is unavailable: {error}") from error


@router.get("/region", summary="Summarize available terrain metrics in a Mars region")
def get_region_assessment(
    west_longitude_deg: float = Query(description="West boundary; positive-east degrees"),
    south_latitude_deg: float = Query(ge=-90, le=90, description="South boundary; planetocentric degrees"),
    east_longitude_deg: float = Query(description="East boundary; positive-east degrees"),
    north_latitude_deg: float = Query(ge=-90, le=90, description="North boundary; planetocentric degrees"),
    categories: str | None = Query(default=None, description="Comma-separated hazard categories; omit for all categories"),
):
    try:
        return summarize_region(
            west_longitude_deg, south_latitude_deg, east_longitude_deg, north_latitude_deg,
            _categories(categories),
        )
    except HazardPolicyError as error:
        raise HTTPException(status_code=503, detail=f"Hazard policy is invalid: {error}") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except OSError as error:
        raise HTTPException(status_code=503, detail=f"Regional hazard assessment is unavailable: {error}") from error
