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

Endpoints: `GET /api/v1/health`, `/api/v1/mars/map/config`, `/api/v1/mars/layers`, `/api/v1/datasets`, and `/api/v1/datasets/{dataset_id}`. `GET /health` remains as a compatibility alias. Configure CORS with comma-separated `MARSCOPE_CORS_ORIGINS`.

Database connectivity, authentication, live dataset ingestion, hazard analysis, and mission operations are not implemented in this foundation.
