"""Train an AI4MARS navigation-terrain segmentation candidate from local labels."""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from app.ml.ai4mars_dataset import (
    CANONICAL_CLASSES,
    IGNORE_LABEL,
    AI4MarsDatasetError,
    inspect_ai4mars_package,
)

PROJECT_ROOT = Path(__file__).resolve().parents[3]
MODEL_ROOT = PROJECT_ROOT / "ml-models" / "terrain"
VERSION_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)


class TerrainTrainingError(ValueError):
    """Raised when training data or the requested training environment is invalid."""


def _dataset_rows(dataset_root: Path, index_file: Path, split: str) -> list[dict[str, str]]:
    import csv

    with index_file.open("r", newline="", encoding="utf-8-sig") as source:
        return [row for row in csv.DictReader(source) if row["split"] == split]


def _confusion_and_metrics(confusion: np.ndarray) -> dict[str, Any]:
    scores: dict[str, Any] = {}
    ious = []
    f1s = []
    for code, label in CANONICAL_CLASSES.items():
        tp = int(confusion[code, code])
        fp = int(confusion[:, code].sum() - tp)
        fn = int(confusion[code, :].sum() - tp)
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        union = tp + fp + fn
        iou = tp / union if union else 0.0
        scores[label] = {"precision": precision, "recall": recall, "f1": f1, "iou": iou, "support_pixels": int(confusion[code, :].sum())}
        ious.append(iou)
        f1s.append(f1)
    total = int(confusion.sum())
    scores["summary"] = {
        "accuracy": float(np.trace(confusion) / total) if total else 0.0,
        "macro_precision": float(np.mean([scores[name]["precision"] for name in CANONICAL_CLASSES.values()])),
        "macro_recall": float(np.mean([scores[name]["recall"] for name in CANONICAL_CLASSES.values()])),
        "macro_f1": float(np.mean(f1s)),
        "mean_iou": float(np.mean(ious)),
        "confusion_matrix_rows_true_columns_predicted": confusion.tolist(),
        "evaluated_labeled_pixels": total,
    }
    return scores


def _make_dataset(dataset_root: Path, rows: list[dict[str, str]], image_size: int):
    import torch
    from torch.utils.data import Dataset

    class AI4MarsTorchDataset(Dataset):
        def __init__(self, entries: list[dict[str, str]]):
            self.entries = entries

        def __len__(self):
            return len(self.entries)

        def __getitem__(self, index: int):
            entry = self.entries[index]
            image_path = (dataset_root / entry["image_path"]).resolve()
            mask_path = (dataset_root / entry["mask_path"]).resolve()
            with Image.open(image_path) as image_source:
                image = image_source.convert("RGB").resize((image_size, image_size), Image.Resampling.BILINEAR)
                image_array = np.asarray(image, dtype=np.float32) / 255.0
            with Image.open(mask_path) as mask_source:
                mask = mask_source.resize((image_size, image_size), Image.Resampling.NEAREST)
                mask_array = np.asarray(mask, dtype=np.uint8).copy()
            image_array = (image_array - np.asarray(IMAGENET_MEAN, dtype=np.float32)) / np.asarray(IMAGENET_STD, dtype=np.float32)
            image_tensor = torch.from_numpy(image_array.transpose(2, 0, 1).copy())
            mask_tensor = torch.from_numpy(mask_array.astype(np.int64, copy=False))
            return image_tensor, mask_tensor

    return AI4MarsTorchDataset(rows)


def _evaluate(model, loader, device) -> dict[str, Any]:
    import torch

    model.eval()
    confusion = np.zeros((len(CANONICAL_CLASSES), len(CANONICAL_CLASSES)), dtype=np.int64)
    with torch.inference_mode():
        for images, masks in loader:
            images = images.to(device)
            masks = masks.to(device)
            predictions = model(images)["out"].argmax(dim=1)
            valid = masks != IGNORE_LABEL
            encoded = masks[valid] * len(CANONICAL_CLASSES) + predictions[valid]
            counts = torch.bincount(encoded, minlength=len(CANONICAL_CLASSES) ** 2)
            confusion += counts.reshape(len(CANONICAL_CLASSES), len(CANONICAL_CLASSES)).cpu().numpy()
    return _confusion_and_metrics(confusion)


def train_ai4mars_candidate(
    dataset_root: str | Path,
    index_file: str | Path,
    version: str,
    *,
    epochs: int = 12,
    batch_size: int = 4,
    image_size: int = 512,
    learning_rate: float = 1e-4,
    device_name: str = "auto",
) -> dict[str, Any]:
    if not VERSION_PATTERN.fullmatch(version):
        raise TerrainTrainingError("Model version must use letters, numbers, dots, underscores, or hyphens")
    if epochs < 1 or batch_size < 1 or image_size < 64 or image_size % 32:
        raise TerrainTrainingError("Use positive epochs/batch-size and image_size >=64 divisible by 32")
    if not math.isfinite(learning_rate) or learning_rate <= 0:
        raise TerrainTrainingError("learning_rate must be a positive finite number")

    root = Path(dataset_root).expanduser().resolve()
    index_path = Path(index_file).expanduser().resolve()
    report = inspect_ai4mars_package(root, index_path)
    if report["license_review_status"] != "reviewed":
        raise AI4MarsDatasetError("Dataset license review is required before training")

    try:
        import torch
        from torch.utils.data import DataLoader
        from torchvision.models.segmentation import deeplabv3_resnet50
    except ImportError as error:
        raise TerrainTrainingError("Install backend/requirements-vision.txt to train the AI4MARS terrain model") from error

    device = torch.device("cuda" if device_name == "auto" and torch.cuda.is_available() else "cpu" if device_name == "auto" else device_name)
    if device.type == "cuda" and not torch.cuda.is_available():
        raise TerrainTrainingError("CUDA was requested but is not available")
    if device.type not in {"cpu", "cuda"}:
        raise TerrainTrainingError("device must be auto, cpu, or cuda")

    entries = {split: _dataset_rows(root, index_path, split) for split in ("train", "validation", "expert_test")}
    datasets = {split: _make_dataset(root, rows, image_size) for split, rows in entries.items()}
    loaders = {
        split: DataLoader(dataset, batch_size=batch_size, shuffle=(split == "train"), num_workers=0, pin_memory=device.type == "cuda")
        for split, dataset in datasets.items()
    }

    # Estimate class weights from the actual training masks only, excluding ignore pixels.
    pixel_counts = np.zeros(len(CANONICAL_CLASSES), dtype=np.int64)
    for row in entries["train"]:
        with Image.open((root / row["mask_path"]).resolve()) as mask_image:
            mask = np.asarray(mask_image, dtype=np.uint8)
        pixel_counts += np.bincount(mask[mask != IGNORE_LABEL].astype(np.int64), minlength=len(CANONICAL_CLASSES))[:len(CANONICAL_CLASSES)]
    if (pixel_counts == 0).any():
        absent = [CANONICAL_CLASSES[index] for index, count in enumerate(pixel_counts) if count == 0]
        raise TerrainTrainingError(f"Training split has no labeled pixels for classes: {', '.join(absent)}")
    class_weights = np.sqrt(pixel_counts.sum() / pixel_counts.astype(np.float64))
    class_weights /= class_weights.mean()

    model = deeplabv3_resnet50(weights=None, weights_backbone=None, num_classes=len(CANONICAL_CLASSES)).to(device)
    loss_fn = torch.nn.CrossEntropyLoss(weight=torch.tensor(class_weights, dtype=torch.float32, device=device), ignore_index=IGNORE_LABEL)
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate)
    best_iou = -1.0
    best_state = None
    validation_history = []
    for epoch in range(epochs):
        model.train()
        total_loss = 0.0
        steps = 0
        for images, masks in loaders["train"]:
            images, masks = images.to(device), masks.to(device)
            optimizer.zero_grad(set_to_none=True)
            logits = model(images)["out"]
            loss = loss_fn(logits, masks)
            loss.backward()
            optimizer.step()
            total_loss += float(loss.detach().cpu())
            steps += 1
        validation_metrics = _evaluate(model, loaders["validation"], device)
        record = {
            "epoch": epoch + 1,
            "mean_training_loss": total_loss / max(steps, 1),
            "validation": validation_metrics["summary"],
        }
        validation_history.append(record)
        if validation_metrics["summary"]["mean_iou"] > best_iou:
            best_iou = validation_metrics["summary"]["mean_iou"]
            best_state = {name: tensor.detach().cpu().clone() for name, tensor in model.state_dict().items()}
    if best_state is None:
        raise TerrainTrainingError("Training produced no checkpoint")
    model.load_state_dict(best_state)
    expert_metrics = _evaluate(model, loaders["expert_test"], device)

    output_dir = MODEL_ROOT / version
    if output_dir.exists():
        raise TerrainTrainingError(f"Model version already exists: {output_dir}")
    MODEL_ROOT.mkdir(parents=True, exist_ok=True)
    try:
        import hashlib

        with tempfile.TemporaryDirectory(prefix=f".{version}-", dir=MODEL_ROOT) as temporary:
            staging = Path(temporary)
            candidate = staging / version
            candidate.mkdir()
            weights_path = candidate / "weights.pt"
            torch.save(best_state, weights_path)
            digest = hashlib.sha256(weights_path.read_bytes()).hexdigest()
            manifest_path = root / "dataset-manifest.json"
            data_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            model_manifest = {
                "model_version": version,
                "model_type": "AI4MARS semantic terrain segmentation",
                "architecture": "torchvision deeplabv3_resnet50",
                "weights_file": "weights.pt",
                "weights_sha256": digest,
                "deployment_status": "candidate",
                "trained_at_utc": datetime.now(timezone.utc).isoformat(),
                "training_dataset": {
                    "dataset_id": "AI4MARS",
                    "dataset_version": data_manifest["dataset_version"],
                    "source": "NASA/JPL AI4MARS; Zenodo record 15995036",
                    "manifest_sha256": hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
                    "selected_task": "navigation",
                    "license_review_status": data_manifest["license_review_status"],
                },
                "classes": {str(code): name for code, name in CANONICAL_CLASSES.items()},
                "ignore_label": IGNORE_LABEL,
                "input": {"image_size": image_size, "mean": IMAGENET_MEAN, "std": IMAGENET_STD},
                "optimizer": {"name": "AdamW", "learning_rate": learning_rate},
                "loss": {"name": "weighted cross entropy", "class_weight_method": "square-root inverse frequency on training masks only", "ignore_index": IGNORE_LABEL},
                "split_counts": {split: len(rows) for split, rows in entries.items()},
                "label_agreement": data_manifest.get("label_agreement"),
                "expert_validation_source": data_manifest.get("expert_validation"),
                "validation_history": validation_history,
                "expert_test_metrics": expert_metrics,
                "confidence_calibration": "not evaluated; per-pixel softmax is not calibrated confidence",
                "interpretation_limit": "Terrain material classification only; classes are not astronaut hazard labels or safe/unsafe decisions.",
                "model_approval": None,
            }
            (candidate / "model-manifest.json").write_text(json.dumps(model_manifest, indent=2) + "\n", encoding="utf-8")
            os.replace(candidate, output_dir)
    except Exception:
        raise
    return model_manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train an AI4MARS terrain segmentation candidate; requires real, reviewed local labels")
    parser.add_argument("--dataset-root", required=True)
    parser.add_argument("--index", required=True, help="CSV image/mask index with group-safe train, validation, and expert_test splits")
    parser.add_argument("--version", required=True)
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--image-size", type=int, default=512)
    parser.add_argument("--learning-rate", type=float, default=1e-4)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    arguments = parser.parse_args()
    result = train_ai4mars_candidate(
        arguments.dataset_root, arguments.index, arguments.version,
        epochs=arguments.epochs, batch_size=arguments.batch_size, image_size=arguments.image_size,
        learning_rate=arguments.learning_rate, device_name=arguments.device,
    )
    print(json.dumps(result, indent=2))
