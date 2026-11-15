from fastapi import APIRouter, HTTPException, Query

from app.services.planetary_archive_service import discover_products

router = APIRouter(prefix="/science", tags=["planetary science"])


@router.get("/products", summary="Find NASA PDS products covering a Mars location")
def get_location_products(
    latitude_deg: float = Query(ge=-90, le=90, description="Areocentric Mars latitude in degrees"),
    longitude_deg: float = Query(description="Positive-east longitude in degrees"),
    radius_km: float = Query(default=20, gt=0, le=500, description="Search half-width around the location"),
):
    try:
        return discover_products(latitude_deg, longitude_deg, radius_km)
    except (TimeoutError, ValueError, OSError) as error:
        raise HTTPException(status_code=503, detail=f"Mars PDS product search is unavailable: {error}") from error
