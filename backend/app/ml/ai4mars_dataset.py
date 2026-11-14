"""Local AI4MARS navigation-mask inspection and split validation.

The NASA Open Data record does not specify a license. This tool consumes a
locally obtained archive only after a reviewer records its version and license
review in the dataset manifest. It does not download, relabel, or synthesize data.
"""

from __future__ import annotations

import csv
import json
from collections import Counter
from pathlib import Path
from typing import Any

CANONICAL_CLASSES = {0: "soil", 1: "bedrock", 2: "sand", 3: "big_rock"}
IGNORE_LABEL = 255
SPLITS = {"train", "validation", "expert_test"}
REQUIRED_INDEX_FIELDS = {"image_path", "mask_path", "split", "group_id", "rover", "label_source"}
REQUIRED_MANIFEST_FIELDS = {
    "dataset_id", "dataset_version", "archive_name", "archive_md5", "license_review_status",
    "license_notes", "selected_task", "label_encoding", "image_format", "mask_format",
}


class AI4MarsDatasetError(ValueError):
    """Raised when an AI4MARS local package is incomplete or ambiguous."""


def _load_manifest(path: Path) -> dict[str, Any]:
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise AI4MarsDatasetError(f"Could not read AI4MARS manifest: {error}") from error
    missing = sorted(REQUIRED_MANIFEST_FIELDS - set(manifest))
    if missing:
        raise AI4MarsDatasetError(f"Dataset manifest is missing: {', '.join(missing)}")
    if manifest["dataset_id"] != "AI4MARS" or manifest["selected_task"] != "navigation":
        raise AI4MarsDatasetError("This trainer supports the AI4MARS navigation taxonomy only")
    if manifest["license_review_status"] != "reviewed":
        raise AI4MarsDatasetError("Record the dataset license review before using local AI4MARS files")
    encoding = manifest["label_encoding"]
    expected = {str(code): label for code, label in CANONICAL_CLASSES.items()}
    expected[str(IGNORE_LABEL)] = "unlabeled"
    if encoding != expected:
        raise AI4MarsDatasetError("AI4MARS navigation label encoding must explicitly map 0–3 and 255")
    if manifest["mask_format"].lower() != "png" or manifest["image_format"].lower() not in {"jpg", "jpeg", "png"}:
        raise AI4MarsDatasetError("Expected PNG segmentation masks and JPEG or PNG rover images")
    return manifest


def inspect_ai4mars_package(dataset_root: str | Path, index_file: str | Path) -> dict[str, Any]:
    """Validate image/mask pairs, taxonomy, expert test provenance, and split isolation."""
    try:
        import numpy as np
        from PIL import Image
    except ImportError as error:
        raise AI4MarsDatasetError("Install backend/requirements-vision.txt to inspect AI4MARS images") from error

    root = Path(dataset_root).expanduser().resolve()
    manifest = _load_manifest(root / "dataset-manifest.json")
    index_path = Path(index_file).expanduser().resolve()
    try:
        with index_path.open("r", newline="", encoding="utf-8-sig") as source:
            reader = csv.DictReader(source)
            if not reader.fieldnames or not REQUIRED_INDEX_FIELDS.issubset(reader.fieldnames):
                raise AI4MarsDatasetError(f"Index CSV needs columns: {', '.join(sorted(REQUIRED_INDEX_FIELDS))}")
            rows = list(reader)
    except OSError as error:
        raise AI4MarsDatasetError(f"Could not read AI4MARS index CSV: {error}") from error
    if not rows:
        raise AI4MarsDatasetError("AI4MARS index CSV contains no image/mask pairs")

    groups_by_split: dict[str, set[str]] = {split: set() for split in SPLITS}
    image_ids: set[str] = set()
    image_counts: Counter[str] = Counter()
    label_pixels: dict[str, Counter[int]] = {split: Counter() for split in SPLITS}
    rovers: dict[str, set[str]] = {split: set() for split in SPLITS}
    for row_number, row in enumerate(rows, start=2):
        split = row["split"].strip()
        group_id = row["group_id"].strip()
        image_id = Path(row["image_path"]).as_posix().lower()
        if split not in SPLITS or not group_id or not image_id:
            raise AI4MarsDatasetError(f"Index row {row_number} has an invalid split or missing identifier")
        if image_id in image_ids:
            raise AI4MarsDatasetError(f"Duplicate image entry at index row {row_number}: {image_id}")
        image_ids.add(image_id)
        if split == "expert_test" and row["label_source"].strip().lower() != "expert":
            raise AI4MarsDatasetError(f"expert_test row {row_number} must declare label_source=expert")
        if split != "expert_test" and row["label_source"].strip().lower() == "expert":
            raise AI4MarsDatasetError(f"Expert annotation at row {row_number} must remain in the reserved expert_test split")

        paths = []
        for field in ("image_path", "mask_path"):
            item = (root / row[field]).resolve()
            if root not in item.parents or not item.is_file():
                raise AI4MarsDatasetError(f"Index row {row_number} points to a missing or out-of-root {field}")
            paths.append(item)
        image_path, mask_path = paths
        try:
            with Image.open(image_path) as image:
                if image.format not in {"JPEG", "PNG"}:
                    raise AI4MarsDatasetError(f"Unsupported rover image format at row {row_number}")
                image_size = image.size
                image.verify()
            with Image.open(mask_path) as mask:
                if mask.format != "PNG" or mask.mode not in {"L", "P"}:
                    raise AI4MarsDatasetError(f"Mask row {row_number} must be an indexed/grayscale PNG")
                mask_array = np.array(mask, copy=True)
        except (OSError, ValueError) as error:
            if isinstance(error, AI4MarsDatasetError):
                raise
            raise AI4MarsDatasetError(f"Could not decode image/mask at index row {row_number}: {error}") from error
        if image_size != (mask_array.shape[1], mask_array.shape[0]):
            raise AI4MarsDatasetError(f"Image/mask dimensions differ at index row {row_number}")
        observed = set(map(int, np.unique(mask_array)))
        unsupported = observed - set(CANONICAL_CLASSES) - {IGNORE_LABEL}
        if unsupported:
            raise AI4MarsDatasetError(f"Mask row {row_number} contains labels outside selected navigation taxonomy: {sorted(unsupported)}")
        if observed <= {IGNORE_LABEL}:
            raise AI4MarsDatasetError(f"Mask row {row_number} has no labeled terrain pixels")

        groups_by_split[split].add(group_id)
        image_counts[split] += 1
        label_pixels[split].update(map(int, mask_array.reshape(-1)))
        rovers[split].add(row["rover"].strip())

    for split in SPLITS:
        if image_counts[split] == 0:
            raise AI4MarsDatasetError(f"The {split} split is empty")
    split_names = sorted(SPLITS)
    for index, left in enumerate(split_names):
        for right in split_names[index + 1:]:
            overlap = groups_by_split[left] & groups_by_split[right]
            if overlap:
                raise AI4MarsDatasetError(f"Group leakage between {left} and {right}: {len(overlap)} shared groups")

    return {
        "status": "validated-local-index",
        "dataset_version": manifest["dataset_version"],
        "selected_task": "navigation",
        "image_count": sum(image_counts.values()),
        "splits": {
            split: {
                "images": image_counts[split],
                "groups": len(groups_by_split[split]),
                "rovers": sorted(rovers[split]),
                "labeled_pixels_by_class": {
                    CANONICAL_CLASSES[code]: int(label_pixels[split][code]) for code in CANONICAL_CLASSES
                },
                "unlabeled_pixels": int(label_pixels[split][IGNORE_LABEL]),
            }
            for split in split_names
        },
        "label_agreement": manifest.get("label_agreement", "not documented in local manifest"),
        "expert_validation": manifest.get("expert_validation", "not documented in local manifest"),
        "license_review_status": manifest["license_review_status"],
        "archive_name": manifest["archive_name"],
        "archive_md5": manifest["archive_md5"],
    }
