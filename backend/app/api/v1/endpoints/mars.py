from fastapi import APIRouter

from app.schemas.mars import MapConfig

router = APIRouter(prefix="/mars", tags=["mars"])

@router.get("/map/config", response_model=MapConfig)
def map_config():
    return MapConfig(
        body="Mars", coordinate_convention="east-positive longitude; geodetic latitude",
        longitude_range=[-180, 180], latitude_range=[-90, 90],
        ellipsoid={"name": "Mars 2000 (Cesium Ellipsoid.MARS)", "equatorial_radius_m": 3396190, "polar_radius_m": 3376200},
        imagery_sources=["viking-mdim", "mola-shade", "ctx-mosaic"],
        note="Imagery availability and source caveats are documented in the frontend catalog; this response does not certify tile delivery.",
    )

@router.get("/layers")
def layers():
    return {"items": [
        {"id": "viking-mdim", "status": "catalogued", "scientific": True},
        {"id": "mola-shade", "status": "catalogued", "scientific": True, "measurement": False},
        {"id": "ctx-mosaic", "status": "beta-unverified", "scientific": True},
        {"id": "terrain-elevation", "status": "unavailable"},
        {"id": "temperature", "status": "unavailable"},
        {"id": "wind", "status": "unavailable"},
        {"id": "hazards", "status": "unavailable"},
        {"id": "astronauts", "status": "unavailable"},
        {"id": "routes", "status": "unavailable"},
    ]}
