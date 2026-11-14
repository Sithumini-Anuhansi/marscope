from fastapi import APIRouter

router = APIRouter(tags=["health"])

@router.get("/health", summary="API health check")
def health():
    return {"status": "ok", "service": "marscope-api", "api_version": "v1"}
