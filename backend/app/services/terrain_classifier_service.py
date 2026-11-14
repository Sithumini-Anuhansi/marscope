"""AI4MARS terrain-only segmentation inference, kept separate from risk labels."""

from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import re
import threading
from collections import OrderedDict
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.ml.ai4mars_dataset import CANONICAL_CLASSES, IGNORE_LABEL

PROJECT_ROOT = Path(__file__).resolve().parents[3]
TERRAIN_MODEL_ROOT = PROJECT_ROOT / "ml-models" / "terrain"
AI4MARS_DATA_ROOT = PROJECT_ROOT / "data" / "ai4mars"
MODEL_VERSION_ENV = "MARSCOPE_TERRAIN_MODEL_VERSION"
VERSION_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
MAX_IMAGE_BYTES = 20 * 1024 * 1024
MAX_ASSESSMENTS = 50
_LOCK = threading.Lock()
_CACHED_MODEL: tuple[str, str, Any, dict[str, Any]] | None = None
_ASSESSMENTS: OrderedDict[str, dict[str, Any]] = OrderedDict()


def _read_active_manifest() -> tuple[Path | None, dict[str, Any] | None, str | None]:
    version = os.getenv(MODEL_VERSION_ENV, "").strip()
    if not version:
        return None, None, f"No active terrain model configured; set {MODEL_VERSION_ENV} after reviewing a candidate."
    if not VERSION_PATTERN.fullmatch(version):
        return None, None, "Configured terrain model version has an invalid format."
    model_dir = (TERRAIN_MODEL_ROOT / version).resolve()
    if model_dir.parent != TERRAIN_MODEL_ROOT.resolve():
        return None, None, "Configured terrain model path is outside the local model registry."
    manifest_path = model_dir / "model-manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None, None, f"No readable AI4MARS model manifest exists for {version}."
    if not isinstance(manifest, dict) or manifest.get("model_version") != version:
        return None, None, "Terrain model version does not match its manifest."
    if manifest.get("deployment_status") != "approved":
        return None, None, "Terrain model is a candidate and has not been reviewed for inference."
    approval = manifest.get("model_approval")
    if not isinstance(approval, dict) or approval.get("status") != "approved" or not approval.get("reviewed_by"):
        return None, None, "Terrain model has no explicit approval record."
    training_dataset = manifest.get("training_dataset")
    if not isinstance(training_dataset, dict) or training_dataset.get("license_review_status") != "reviewed":
        return None, None, "Training dataset license has not been reviewed."
    if manifest.get("classes") != {str(code): name for code, name in CANONICAL_CLASSES.items()}:
        return None, None, "Terrain model class taxonomy does not match this inference service."
    filename = manifest.get("weights_file", "")
    if not isinstance(filename, str) or Path(filename).name != filename or filename != "weights.pt":
        return None, None, "Terrain model weight path is invalid."
    weights_path = (model_dir / filename).resolve()
    if weights_path.parent != model_dir or not weights_path.is_file():
        return None, None, "Terrain model weights are missing or outside the model registry."
    try:
        digest = hashlib.sha256(weights_path.read_bytes()).hexdigest()
    except OSError:
        return None, None, "Could not read terrain model weights."
    if digest != manifest.get("weights_sha256"):
        return None, None, "Terrain model weight hash does not match the manifest."
    return weights_path, manifest, None


def terrain_classifier_status() -> dict[str, Any]:
    candidates = sorted(path.parent.name for path in TERRAIN_MODEL_ROOT.glob("*/model-manifest.json")) if TERRAIN_MODEL_ROOT.exists() else []
    _weights, manifest, reason = _read_active_manifest()
    local_dataset = (AI4MARS_DATA_ROOT / "dataset-manifest.json").is_file()
    return {
        "component": "ai4mars-terrain-segmentation",
        "status": "available" if manifest else "model-unavailable",
        "dataset": {
            "dataset_id": "AI4MARS",
            "source_version": "NASA Open Data record; Zenodo v0.6 optional update",
            "local_manifest_found": local_dataset,
            "local_dataset_path": str(AI4MARS_DATA_ROOT) if local_dataset else None,
        },
        "model_version": manifest.get("model_version") if manifest else None,
        "candidate_versions": candidates,
        "classes": {str(code): name for code, name in CANONICAL_CLASSES.items()},
        "ignore_label": IGNORE_LABEL,
        "probability_calibrated": False,
        "risk_labels_available": False,
        "message": reason or "Terrain classes describe image material only. They do not represent hazards or safe/unsafe labels.",
    }


def _load_active_model() -> tuple[Any, dict[str, Any]] | None:
    global _CACHED_MODEL
    weights_path, manifest, error = _read_active_manifest()
    if error or weights_path is None or manifest is None:
        return None
    if manifest.get("architecture") != "torchvision deeplabv3_resnet50":
        return None
    key = (manifest["model_version"], manifest["weights_sha256"])
    with _LOCK:
        if _CACHED_MODEL and _CACHED_MODEL[:2] == key:
            return _CACHED_MODEL[2], _CACHED_MODEL[3]
        try:
            import torch
            from torchvision.models.segmentation import deeplabv3_resnet50

            model = deeplabv3_resnet50(weights=None, weights_backbone=None, num_classes=len(CANONICAL_CLASSES))
            state = torch.load(weights_path, map_location="cpu", weights_only=True)
            model.load_state_dict(state, strict=True)
            model.eval()
        except Exception:
            return None
        _CACHED_MODEL = (*key, model, manifest)
        return model, manifest


def _store_assessment(result: dict[str, Any]) -> None:
    with _LOCK:
        _ASSESSMENTS[result["assessment_id"]] = result
        _ASSESSMENTS.move_to_end(result["assessment_id"])
        while len(_ASSESSMENTS) > MAX_ASSESSMENTS:
            _ASSESSMENTS.popitem(last=False)


def get_terrain_assessment(assessment_id: str) -> dict[str, Any] | None:
    with _LOCK:
        return _ASSESSMENTS.get(assessment_id)


def classify_terrain_image(image_bytes: bytes, media_type: str) -> dict[str, Any]:
    if not image_bytes:
        raise ValueError("Image body is empty")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise ValueError(f"Image exceeds the {MAX_IMAGE_BYTES // (1024 * 1024)} MiB limit")
    if media_type not in {"image/jpeg", "image/png"}:
        raise ValueError("Upload a JPEG or PNG rover image")
    active = _load_active_model()
    if active is None:
        return {"assessment_status": "unavailable", "reason": terrain_classifier_status()["message"], "terrain_classes": [], "model_version": None}
    try:
        import numpy as np
        from PIL import Image
    except ImportError as error:
        return {"assessment_status": "unavailable", "reason": "Install backend/requirements-vision.txt to enable image classification.", "terrain_classes": [], "model_version": None}
    model, manifest = active
    try:
        with Image.open(io.BytesIO(image_bytes)) as source:
            if source.format not in {"JPEG", "PNG"}:
                raise ValueError("Image content does not match JPEG or PNG format")
            original_width, original_height = source.size
            image = source.convert("RGB")
            target_size = int(manifest["input"]["image_size"])
            image = image.resize((target_size, target_size), Image.Resampling.BILINEAR)
            rgb = np.asarray(image, dtype=np.float32) / 255.0
    except (OSError, KeyError, TypeError, ValueError) as error:
        if isinstance(error, ValueError):
            raise
        raise ValueError(f"Could not decode image: {error}") from error
    mean = np.asarray(manifest["input"]["mean"], dtype=np.float32)
    std = np.asarray(manifest["input"]["std"], dtype=np.float32)
    if mean.shape != (3,) or std.shape != (3,) or (std <= 0).any():
        raise ValueError("Model preprocessing metadata is invalid")

    import torch

    tensor = torch.from_numpy(((rgb - mean) / std).transpose(2, 0, 1).copy()).unsqueeze(0)
    with torch.inference_mode():
        logits = model(tensor)["out"][0]
        probabilities = torch.softmax(logits, dim=0)
        prediction = probabilities.argmax(dim=0).to(torch.uint8).cpu().numpy()
        max_probability = probabilities.max(dim=0).values.cpu().numpy()
    counts = np.bincount(prediction.reshape(-1), minlength=len(CANONICAL_CLASSES))
    total_pixels = int(prediction.size)
    summary = []
    for code, name in CANONICAL_CLASSES.items():
        mask = prediction == code
        summary.append({
            "class_id": code,
            "class_name": name,
            "pixel_fraction": float(counts[code] / total_pixels),
            "mean_uncalibrated_softmax": float(max_probability[mask].mean()) if mask.any() else None,
        })
    mask_image = Image.fromarray(prediction, mode="L")
    output = io.BytesIO()
    mask_image.save(output, format="PNG")
    result = {
        "assessment_id": str(uuid4()),
        "assessment_status": "terrain-classification-limited",
        "terrain_classes": summary,
        "dominant_terrain_class": max(summary, key=lambda row: row["pixel_fraction"])["class_name"],
        "mask_png_base64": base64.b64encode(output.getvalue()).decode("ascii"),
        "source_image": {"width": original_width, "height": original_height, "media_type": media_type},
        "model_version": manifest["model_version"],
        "probability_calibrated": False,
        "contributing_factors": [],
        "explanation": "AI4MARS navigation-terrain segmentation prediction. Pixel classes describe soil, bedrock, sand, or big-rock appearance; they are not hazard labels or safety decisions.",
        "uncertainty": "Per-pixel softmax is uncalibrated. Domain shift between rover cameras, illumination, and future human surface imagery is not quantified.",
        "georeferencing": "No location is attached because the uploaded image has no validated pose/camera metadata.",
    }
    _store_assessment(result)
    return result
