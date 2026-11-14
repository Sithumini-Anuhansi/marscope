from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field, field_validator

class ObservationCategory(str, Enum):
    DANGER = 'danger'
    SHELTER = 'shelter'
    WATER_ICE = 'water-ice'
    RESOURCE = 'resource'
    DISCOVERY = 'discovery'
    OBSTACLE = 'obstacle'
    OTHER = 'other'

class VerificationStatus(str, Enum):
    UNVERIFIED = 'unverified'
    UNDER_REVIEW = 'under-review'
    VERIFIED = 'verified'
    REJECTED = 'rejected'

class ObservationCreate(BaseModel):
    astronaut_id: str = Field(min_length=1, max_length=80)
    category: ObservationCategory
    description: str = Field(min_length=3, max_length=2000)
    latitude_deg: float = Field(ge=-90, le=90)
    longitude_deg: float = Field(ge=-180, le=180)
    severity: str | None = Field(default=None, max_length=30)
    image_refs: list[str] = Field(default_factory=list, max_length=8)
    supporting_evidence: str | None = Field(default=None, max_length=2000)

class ObservationUpdate(BaseModel):
    description: str | None = Field(default=None, min_length=3, max_length=2000)
    severity: str | None = Field(default=None, max_length=30)
    image_refs: list[str] | None = Field(default=None, max_length=8)
    supporting_evidence: str | None = Field(default=None, max_length=2000)
    verification_status: VerificationStatus | None = None

class Observation(ObservationCreate):
    id: str
    mission_id: str
    submitted_at: datetime
    verification_status: VerificationStatus = VerificationStatus.UNVERIFIED

    @field_validator('image_refs')
    @classmethod
    def validate_image_refs(cls, refs: list[str]) -> list[str]:
        if any(not ref.startswith(('https://', 'http://')) for ref in refs):
            raise ValueError('image references must be HTTP(S) URLs')
        return refs
