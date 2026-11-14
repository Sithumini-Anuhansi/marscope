# MARSCOPE API

Python 3.10+ recommended. The API starts without PostgreSQL, PostGIS, NASA credentials, or downloaded datasets. Dataset responses are metadata stubs marked `planned`; they do not imply data retrieval or validation.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Interactive API documentation: `http://127.0.0.1:8000/docs`.

Endpoints include `GET /api/v1/health`, Mars map/layer configuration, dataset metadata, hazard status/location/region assessments, and risk status/assessment submission/retrieval. `GET /health` remains as a compatibility alias. Configure CORS with comma-separated `MARSCOPE_CORS_ORIGINS`.

Database connectivity, authentication, live dataset ingestion beyond the explicit MOLA sample, validated hazard severity thresholds, and mission operations are not implemented in this foundation.

Optional MOLA terrain processing uses Rasterio and NumPy. Install it separately with `python -m pip install -r requirements-geo.txt`; instructions and processing limits are in `docs/geospatial-processing.md`. Test dependencies are in `requirements-test.txt`.

Hazard assessment scope, API parameters, uncertainty behavior, and the optional evidence-required policy format are documented in `docs/hazard-analysis.md`.

AI/ML risk API status, validated-input schema, rule-baseline behavior, model limitations, and readiness criteria are documented in `docs/risk-assessment.md`.
