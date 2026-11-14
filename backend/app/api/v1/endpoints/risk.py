from fastapi import APIRouter, HTTPException

from app.schemas.risk import RiskAssessmentRequest
from app.services.hazard_analysis import HazardPolicyError
from app.services.risk_assessment import (
    assess_risk,
    get_cached_assessment,
    risk_service_status,
)

router = APIRouter(prefix="/risk", tags=["risk assessment"])


@router.get("/status", summary="Report AI model and rule-baseline readiness")
def get_risk_status():
    try:
        return risk_service_status()
    except (OSError, ValueError, HazardPolicyError) as error:
        raise HTTPException(status_code=503, detail=f"Risk service configuration is invalid: {error}") from error


@router.post("/assessments", summary="Submit validated Mars risk-assessment inputs")
def create_risk_assessment(request: RiskAssessmentRequest):
    try:
        return assess_risk(request)
    except HazardPolicyError as error:
        raise HTTPException(status_code=503, detail=f"Risk policy is invalid: {error}") from error
    except (OSError, ValueError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.get("/assessments/{assessment_id}", summary="Retrieve a recent in-memory assessment result")
def get_risk_assessment(assessment_id: str):
    assessment = get_cached_assessment(assessment_id)
    if assessment is None:
        raise HTTPException(status_code=404, detail="Assessment not found; it may have expired or the API may have restarted")
    return assessment
