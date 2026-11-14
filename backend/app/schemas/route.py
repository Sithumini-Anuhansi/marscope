"""Validated route planning inputs and result envelopes."""

from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator


class MarsRoutePoint(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    latitude_deg: float = Field(ge=-90, le=90)
    longitude_deg: float
    latitude_type: Literal["planetocentric"] = "planetocentric"
    longitude_direction: Literal["positive-east"] = "positive-east"

    @field_validator("longitude_deg")
    @classmethod
    def validate_longitude(cls, value: float) -> float:
        if not -180 <= value <= 360:
            raise ValueError("longitude_deg must be in [-180, 360] positive-east degrees")
        return value


class RoutePlanningRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    start: MarsRoutePoint
    destination: MarsRoutePoint
    maximum_source_cell_km: float = Field(gt=0, le=1000, description="Mission-selected maximum accepted raster cell size")
    maximum_slope_deg: float | None = Field(default=None, ge=0, le=90, description="Optional mission mobility constraint; not a universal astronaut limit")
    slope_penalty_per_degree: float = Field(ge=0, le=100)
    roughness_penalty_per_meter: float = Field(ge=0, le=100)
    avoid_policy_classified_high_hazards: bool = True
    alternative_count: int = Field(default=2, ge=0, le=2)
    astronaut_id: str | None = Field(default=None, min_length=1, max_length=80)
    mission_objective: Literal["balanced", "minimize_slope", "minimize_roughness"] = "balanced"


class RouteComparisonRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    route_ids: list[str] = Field(min_length=2, max_length=3)
