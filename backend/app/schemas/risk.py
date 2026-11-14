from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

RiskFeatureName = Literal[
    "terrain_slope",
    "surface_roughness",
    "elevation_variation",
    "temperature",
    "wind_speed",
    "dust_opacity",
]

FEATURE_UNITS = {
    "terrain_slope": "degree",
    "surface_roughness": "m",
    "elevation_variation": "m",
    "temperature": "K",
    "wind_speed": "m/s",
    "dust_opacity": "unitless",
}


class RiskFeatureInput(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra="forbid")

    value: float
    units: str = Field(min_length=1, max_length=32)
    source_dataset: str = Field(min_length=1, max_length=200)
    source_product_id: str | None = Field(default=None, max_length=200)
    observation_period_start: datetime
    observation_period_end: datetime
    resolution_km: float = Field(gt=0, le=100000)

    @field_validator("observation_period_start", "observation_period_end")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("observation period timestamps must include a timezone")
        return value

    @model_validator(mode="after")
    def validate_period_order(self):
        if self.observation_period_start > self.observation_period_end:
            raise ValueError("observation period start must not follow its end")
        return self


class RiskAssessmentRequest(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra="forbid")

    latitude_deg: float = Field(ge=-90, le=90, description="Planetocentric Mars latitude")
    longitude_deg: float = Field(description="Positive-east Mars longitude")
    latitude_type: Literal["planetocentric"] = "planetocentric"
    longitude_direction: Literal["positive-east"] = "positive-east"
    features: dict[RiskFeatureName, RiskFeatureInput] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_feature_units_and_ranges(self):
        for name, feature in self.features.items():
            if feature.units != FEATURE_UNITS[name]:
                raise ValueError(f"{name} must use units {FEATURE_UNITS[name]}")
            if name == "terrain_slope" and not 0 <= feature.value <= 90:
                raise ValueError("terrain_slope must be in [0, 90] degrees")
            if name in {"surface_roughness", "elevation_variation", "wind_speed", "dust_opacity"} and feature.value < 0:
                raise ValueError(f"{name} must be non-negative")
            if name == "temperature" and feature.value <= 0:
                raise ValueError("temperature must be greater than 0 K")
        if not -180 <= self.longitude_deg <= 360:
            raise ValueError("longitude_deg must be in [-180, 360] degrees")
        return self
