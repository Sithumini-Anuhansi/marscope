from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field

class Position(BaseModel):
    latitude_deg: float = Field(ge=-90, le=90)
    longitude_deg: float = Field(ge=-180, le=180)
    timestamp: datetime

class Astronaut(BaseModel):
    id: str
    name: str
    role: str
    status: Literal['on-eva', 'in-habitat', 'rest', 'comms', 'stale', 'untracked'] = 'untracked'
    latitude_deg: float | None = None
    longitude_deg: float | None = None
    location_timestamp: datetime | None = None
    path: list[Position] = Field(default_factory=list)

class Mission(BaseModel):
    id: str
    name: str
    astronauts: list[Astronaut]

class LocationUpdate(Position):
    astronaut_id: str
