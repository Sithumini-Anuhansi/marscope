from datetime import datetime
from enum import Enum
from pydantic import BaseModel, ConfigDict, Field, field_validator

class ResourceKind(str, Enum):
    OXYGEN='oxygen'; WATER='water'; FOOD='food'; POWER='power'; FUEL='fuel'

class EquipmentState(str, Enum):
    OPERATIONAL='operational'; DEGRADED='degraded'; FAILED='failed'; UNKNOWN='unknown'

class InventoryUpdate(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra='forbid')
    astronaut_id: str | None = None
    resource: ResourceKind
    amount: float = Field(ge=0)
    reserve_amount: float = Field(ge=0)
    unit: str = Field(min_length=1, max_length=24)
    updated_at: datetime

    @field_validator('updated_at')
    @classmethod
    def require_timezone(cls, value):
        if value.tzinfo is None or value.utcoffset() is None: raise ValueError('timestamp must include a timezone')
        return value

class ConsumptionInput(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra='forbid')
    astronaut_id: str | None = None
    resource: ResourceKind
    amount: float = Field(gt=0)
    unit: str = Field(min_length=1, max_length=24)
    recorded_at: datetime

    @field_validator('recorded_at')
    @classmethod
    def require_timezone(cls, value):
        if value.tzinfo is None or value.utcoffset() is None: raise ValueError('timestamp must include a timezone')
        return value

class EquipmentUpdate(BaseModel):
    astronaut_id: str | None = None
    equipment_id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=120)
    status: EquipmentState
    updated_at: datetime

    @field_validator('updated_at')
    @classmethod
    def require_timezone(cls, value):
        if value.tzinfo is None or value.utcoffset() is None: raise ValueError('timestamp must include a timezone')
        return value

class CommunicationsUpdate(BaseModel):
    astronaut_id: str | None = None
    available: bool
    updated_at: datetime

    @field_validator('updated_at')
    @classmethod
    def require_timezone(cls, value):
        if value.tzinfo is None or value.utcoffset() is None: raise ValueError('timestamp must include a timezone')
        return value
