from pydantic import BaseModel, Field

class MapConfig(BaseModel):
    body: str
    coordinate_convention: str
    longitude_range: list[float] = Field(min_length=2, max_length=2)
    latitude_range: list[float] = Field(min_length=2, max_length=2)
    ellipsoid: dict[str, str | float]
    imagery_sources: list[str]
    note: str
