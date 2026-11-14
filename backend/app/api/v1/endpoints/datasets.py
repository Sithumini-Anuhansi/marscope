from fastapi import APIRouter, HTTPException
import json
from pathlib import Path
import re
from fastapi.responses import FileResponse

from app.services.dataset_registry import DATASETS

router = APIRouter(prefix="/datasets", tags=["datasets"])

RAW_DATA_ROOT = Path(__file__).resolve().parents[5] / "data" / "raw"


def _with_local_sample(item: dict) -> dict:
    result = dict(item)
    manifest_path = RAW_DATA_ROOT / "mola" / "megt90n000cb.manifest.json"
    if item["id"] == "mola" and manifest_path.is_file():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        result["local_sample"] = manifest
        result["downloaded"] = True
        result["status"] = manifest.get("data_status", "downloaded; validation state unknown")
        result["structurally_validated"] = bool(manifest.get("validation"))
    else:
        result["local_sample"] = None
        result["structurally_validated"] = False
    return result

@router.get("")
def list_datasets():
    return {"items": [_with_local_sample(dataset) for dataset in DATASETS], "count": len(DATASETS)}


@router.get("/mola/processed", summary="Get local MOLA processing manifest")
def get_mola_processing_manifest():
    processed_root = RAW_DATA_ROOT.parent / "processed" / "mola"
    manifests = sorted(processed_root.glob("MEGT90N000CB-*/processing-manifest.json"))
    if not manifests:
        raise HTTPException(status_code=404, detail="No local MOLA processing output is available")
    runs = []
    for path in manifests:
        manifest = json.loads(path.read_text(encoding="utf-8"))
        run_id = path.parent.name
        manifest["layers"] = {
            layer_id: f"/api/v1/datasets/mola/processed/{run_id}/{layer_id}"
            for layer_id in manifest.get("outputs", {})
        }
        runs.append(manifest)
    return {"runs": runs}


@router.get("/mola/processed/{run_id}/{layer_id}", summary="Download a processed MOLA GeoTIFF layer")
def get_mola_processed_layer(run_id: str, layer_id: str):
    if not re.fullmatch(r"MEGT90N000CB-[0-9TZ]+", run_id):
        raise HTTPException(status_code=400, detail="Invalid MOLA processing run ID")
    filenames = {
        "elevation": "mola_topography_m.tif",
        "slope": "terrain_slope_deg.tif",
        "aspect": "terrain_aspect_deg.tif",
        "roughness": "terrain_roughness_std_m.tif",
    }
    if layer_id not in filenames:
        raise HTTPException(status_code=404, detail="Unknown processed MOLA layer")
    path = RAW_DATA_ROOT.parent / "processed" / "mola" / run_id / filenames[layer_id]
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Processed MOLA layer not found")
    return FileResponse(path, media_type="image/tiff", filename=path.name)

@router.get("/{dataset_id}")
def get_dataset(dataset_id: str):
    item = next((dataset for dataset in DATASETS if dataset["id"] == dataset_id), None)
    if item is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return _with_local_sample(item)
