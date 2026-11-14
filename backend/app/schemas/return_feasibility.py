from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

class ReturnScenario(BaseModel):
    model_config=ConfigDict(allow_inf_nan=False,extra='forbid')
    scenario_id: str = Field(min_length=1,max_length=80)
    name: str = Field(min_length=1,max_length=120)
    return_duration_days: float|None=Field(default=None,gt=0)
    available_time_days: float|None=Field(default=None,gt=0)
    crew_available: bool|None=None
    route_status: Literal['feasible','constrained','infeasible','unknown']='unknown'
    environmental_risk: Literal['low','moderate','high','unknown']='unknown'
    equipment_ready: bool|None=None
    return_vehicle_ready: bool|None=None

class ReturnAssessmentRequest(BaseModel):
    model_config=ConfigDict(extra='forbid')
    scenarios: list[ReturnScenario]=Field(min_length=1,max_length=5)
