from typing import Literal

from pydantic import BaseModel, Field


class CelestialBody(BaseModel):
    id: str
    name: str
    classification: str
    diameter_km: float | None = None
    dimensions_km: list[float] | None = None
    mass_kg: float | None = None
    mean_distance_km: float | None = None
    orbital_period_days: float | None = None
    rotation_period_hours: float | None = None
    gravity_m_s2: float | None = None
    mean_surface_temperature_c: float | None = None
    atmosphere: str | None = None
    description: str
    discovery: str | None = None
    parent_id: str | None = None
    reference_source: str
    value_kind: Literal['approximate reference'] = 'approximate reference'


class EphemerisVector(BaseModel):
    epoch: str
    x_km: float
    y_km: float
    z_km: float
    vx_km_s: float | None = None
    vy_km_s: float | None = None
    vz_km_s: float | None = None


class EphemerisTrack(BaseModel):
    target: str
    center: str
    status: Literal['live', 'cached', 'stale', 'unavailable']
    fetched_at: str | None = None
    cache_age_seconds: int | None = None
    error: str | None = None
    vectors: list[EphemerisVector] = Field(default_factory=list)


class PositionsResponse(BaseModel):
    source: str = 'NASA/JPL Horizons'
    coordinate_frame: str
    reference_plane: str = 'ECLIPTIC'
    reference_system: str = 'ICRF'
    time_scale: str = 'UT'
    output_units: str = 'km and km/s'
    tracks: list[EphemerisTrack]


class MarsSystemResponse(PositionsResponse):
    center_body: str = 'Mars'
    orbit_visualization_note: str = 'Rendered distances are scaled for visibility; vectors are returned in a common Mars-centered frame.'
