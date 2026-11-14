from fastapi import APIRouter, HTTPException, Request

from app.schemas.ai import AISynthesisRequest
from app.services.hazard_analysis import HazardPolicyError
from app.services.model_registry_service import ai_service_status, list_ai_models
from app.services.risk_synthesis_service import synthesize_risk_assessment
from app.services.terrain_classifier_service import MAX_IMAGE_BYTES, classify_terrain_image

router = APIRouter(prefix="/ai", tags=["hybrid AI"])


@router.get("/status", summary="Report hybrid AI component readiness")
def get_ai_status():
    try:
        return ai_service_status()
    except (OSError, ValueError, HazardPolicyError) as error:
        raise HTTPException(status_code=503, detail=f"AI service status is unavailable: {error}") from error


@router.get("/models", summary="List candidate and approved MARSCOPE AI models")
def get_ai_models():
    try:
        return list_ai_models()
    except (OSError, ValueError, HazardPolicyError) as error:
        raise HTTPException(status_code=503, detail=f"AI model registry is unavailable: {error}") from error


@router.post("/terrain/classify", summary="Classify terrain pixels in a rover image")
async def classify_terrain(request: Request):
    media_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if media_type not in {"image/jpeg", "image/png"}:
        raise HTTPException(status_code=415, detail="Content-Type must be image/jpeg or image/png")
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 20 MiB upload limit")
    chunks = bytearray()
    async for chunk in request.stream():
        chunks.extend(chunk)
        if len(chunks) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="Image exceeds the 20 MiB upload limit")
    try:
        return classify_terrain_image(bytes(chunks), media_type)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/risk/assess", summary="Synthesize science indicators and mission context")
def assess_ai_risk(request: AISynthesisRequest):
    try:
        return synthesize_risk_assessment(request)
    except HazardPolicyError as error:
        raise HTTPException(status_code=503, detail=f"Environmental assessment policy is invalid: {error}") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
