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

Database connectivity for mission telemetry requires `DATABASE_URL` and the documented PostGIS schema setup. Actor-token authentication is required for collaborative observation and resource writes. Live dataset ingestion beyond the explicit MOLA sample, validated hazard severity thresholds, and certified mission operations are not implemented in this foundation.

Optional MOLA terrain processing uses Rasterio and NumPy. Install it separately with `python -m pip install -r requirements-geo.txt`; instructions and processing limits are in `docs/geospatial-processing.md`. Test dependencies are in `requirements-test.txt`.

Hazard assessment scope, API parameters, uncertainty behavior, and the optional evidence-required policy format are documented in `docs/hazard-analysis.md`.

Crew tracking uses `GET /api/v1/missions/ares-iv/crew` and WebSocket `/api/v1/missions/ares-iv/locations`. Send JSON location updates with `astronaut_id`, `latitude_deg`, `longitude_deg`, and an ISO-8601 timezone-aware `timestamp`. Coordinates are geodetic latitude and east-positive longitude in degrees on Mars 2000; they are not Earth/WGS84 coordinates. History is capped at 500 points per crew member in memory. For durable history, install PostGIS, apply `database/crew_tracking.sql`, configure `DATABASE_URL`, and install requirements; every accepted location is then stored in PostGIS with SRID 0 (unprojected Mars degrees). The API remains usable in memory without a database. Fixes older than 60 seconds are rejected, and positions with no recent update are reported stale.

AI/ML risk API status, validated-input schema, rule-baseline behavior, model limitations, and readiness criteria are documented in `docs/risk-assessment.md`.

Survival resource telemetry, reserve alert semantics, measured-rate endurance assumptions, and return-feasibility limitations are documented in `docs/survival-and-return.md`.
