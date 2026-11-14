from pydantic import BaseModel, ConfigDict, Field, field_validator


class CrewObservationContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    observation_id: str | None = Field(default=None, max_length=128)
    category: str = Field(min_length=1, max_length=80)
    description: str = Field(min_length=1, max_length=2000)
    source: str = Field(default="crew-reported; unverified", max_length=160)


class AISynthesisRequest(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra="forbid")

    latitude_deg: float = Field(ge=-90, le=90, description="Planetocentric Mars latitude")
    longitude_deg: float = Field(description="Positive-east Mars longitude")
    categories: list[str] | None = None
    terrain_assessment_id: str | None = Field(default=None, max_length=80)
    crew_observations: list[CrewObservationContext] = Field(default_factory=list, max_length=100)
    mission_constraints: list[str] = Field(default_factory=list, max_length=100)

    @field_validator("longitude_deg")
    @classmethod
    def validate_longitude(cls, value: float) -> float:
        if not -180 <= value <= 360:
            raise ValueError("longitude_deg must be in [-180, 360] positive-east degrees")
        return value
