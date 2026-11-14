from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.endpoints import ai, crew, datasets, hazards, health, mars, risk, routes
from app.core.config import settings

app = FastAPI(
    title="MARSCOPE API",
    description="Versioned mission and Mars mapping API. Scientific integrations are reported only when validated.",
    version="0.1.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(health.router, prefix="/api/v1")
app.include_router(mars.router, prefix="/api/v1")
app.include_router(datasets.router, prefix="/api/v1")
app.include_router(hazards.router, prefix="/api/v1")
app.include_router(risk.router, prefix="/api/v1")
app.include_router(ai.router, prefix="/api/v1")
app.include_router(crew.router, prefix="/api/v1")
app.include_router(routes.router, prefix="/api/v1")

@app.get("/health", include_in_schema=False)
def legacy_health():
    """Compatibility health endpoint for older frontend builds."""
    return {"status": "ok", "service": "marscope-api", "api_version": "v1"}
