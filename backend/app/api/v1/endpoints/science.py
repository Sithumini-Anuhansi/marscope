from fastapi import APIRouter, HTTPException, Query
from pathlib import Path
import zipfile

from app.services.meda_ingestion import MedaIngestionError, load_meda_index
from app.services.planetary_archive_service import discover_products
from app.services.science_demo_service import get_science_demo
from app.services.planetary_feature_catalog import query_named_features
from app.services.astrobiology_service import get_astrobiology_maps

router = APIRouter(prefix="/science", tags=["planetary science"])
RAW_DATA_ROOT = Path(__file__).resolve().parents[5] / "data" / "raw"


@router.get("/demo", summary="Get visibly labelled illustrative Mars dataset demo records")
def get_demo_science_records():
    return get_science_demo()


@router.get("/meda/index", summary="Read locally ingested MEDA calibrated product index")
def get_meda_index(limit: int = Query(default=8, ge=1, le=50)):
    try:
        return load_meda_index(RAW_DATA_ROOT / "meda", limit)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except (OSError, ValueError, MedaIngestionError) as error:
        raise HTTPException(status_code=503, detail=f"MEDA archive index is unavailable: {error}") from error


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


@router.get("/named-features", summary="Get official USGS/IAU Mars names visible in a map extent")
def get_named_features(
    west_deg: float = Query(description="West longitude, east-positive degrees"),
    south_deg: float = Query(ge=-90, le=90),
    east_deg: float = Query(description="East longitude, east-positive degrees; may cross the date line"),
    north_deg: float = Query(ge=-90, le=90),
    minimum_diameter_km: float = Query(default=0, ge=0, le=20000),
    limit: int = Query(default=600, ge=1, le=2000),
):
    try:
        return query_named_features(west_deg, south_deg, east_deg, north_deg, minimum_diameter_km, limit)
    except FileNotFoundError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        raise HTTPException(status_code=503, detail=f"USGS/IAU Mars name catalog is unavailable: {error}") from error


@router.get("/astrobiology/maps", summary="Get separate habitability and biosignature evidence map layers")
def get_astrobiology_map_layers():
    """Return cited regional evidence without fabricating a composite score or life finding."""
    return get_astrobiology_maps()
