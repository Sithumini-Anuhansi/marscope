from fastapi import APIRouter, HTTPException

from app.services.dataset_registry import DATASETS

router = APIRouter(prefix="/datasets", tags=["datasets"])

@router.get("")
def list_datasets():
    return {"items": DATASETS, "count": len(DATASETS)}

@router.get("/{dataset_id}")
def get_dataset(dataset_id: str):
    item = next((dataset for dataset in DATASETS if dataset["id"] == dataset_id), None)
    if item is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return item
