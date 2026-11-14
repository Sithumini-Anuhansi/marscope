from fastapi import APIRouter, HTTPException
import json
from pathlib import Path

from app.services.dataset_registry import DATASETS

router = APIRouter(prefix="/datasets", tags=["datasets"])

RAW_DATA_ROOT = Path(__file__).resolve().parents[5] / "data" / "raw"


def _with_local_sample(item: dict) -> dict:
    result = dict(item)
    manifest_path = RAW_DATA_ROOT / "mola" / "megt90n000cb.manifest.json"
    if item["id"] == "mola" and manifest_path.is_file():
        result["local_sample"] = json.loads(manifest_path.read_text(encoding="utf-8"))
    else:
        result["local_sample"] = None
    return result

@router.get("")
def list_datasets():
    return {"items": [_with_local_sample(dataset) for dataset in DATASETS], "count": len(DATASETS)}

@router.get("/{dataset_id}")
def get_dataset(dataset_id: str):
    item = next((dataset for dataset in DATASETS if dataset["id"] == dataset_id), None)
    if item is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return _with_local_sample(item)
