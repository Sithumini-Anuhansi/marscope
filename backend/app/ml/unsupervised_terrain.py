"""Optional exploratory clustering/anomaly analysis on processed MOLA measurements.

Outputs are isolated from operational hazard results and receive no hazard label.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import numpy as np
import rasterio
from rasterio.windows import Window
from sklearn.cluster import DBSCAN, KMeans
from sklearn.decomposition import PCA
from sklearn.ensemble import IsolationForest
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

PROJECT_ROOT = Path(__file__).resolve().parents[3]
PROCESSED_ROOT = PROJECT_ROOT / "data" / "processed" / "mola"
OUTPUT_ROOT = PROJECT_ROOT / "data" / "experimental" / "unsupervised"
FEATURE_LAYERS = {
    "elevation_m": "mola_topography_m.tif",
    "slope_deg": "terrain_slope_deg.tif",
    "roughness_m": "terrain_roughness_std_m.tif",
}


def _latest_run() -> tuple[Path, dict[str, Any]]:
    for manifest_path in sorted(PROCESSED_ROOT.glob("MEGT90N000CB-*/processing-manifest.json"), reverse=True):
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            if manifest.get("product_id") == "MEGT90N000CB" and all((manifest_path.parent / name).is_file() for name in FEATURE_LAYERS.values()):
                return manifest_path.parent, manifest
        except (OSError, json.JSONDecodeError):
            continue
    raise FileNotFoundError("No validated processed MOLA terrain run is available")


def _experiment_features(run_dir: Path, sample_count: int, seed: int) -> tuple[np.ndarray, np.ndarray, tuple[int, int]]:
    opened = {name: rasterio.open(run_dir / filename) for name, filename in FEATURE_LAYERS.items()}
    try:
        first = next(iter(opened.values()))
        shape = (first.height, first.width)
        arrays = [dataset.read(1).astype(np.float32) for dataset in opened.values()]
        valid = np.logical_and.reduce([np.isfinite(array) & (array != dataset.nodata) for array, dataset in zip(arrays, opened.values())])
        coordinates = np.argwhere(valid)
        if len(coordinates) < 10:
            raise ValueError("Too few valid MOLA cells for exploratory analysis")
        rng = np.random.default_rng(seed)
        selected = rng.choice(len(coordinates), size=min(sample_count, len(coordinates)), replace=False)
        cells = coordinates[selected]
        features = np.column_stack([array[cells[:, 0], cells[:, 1]] for array in arrays]).astype(np.float64)
        if not np.isfinite(features).all():
            raise ValueError("Selected MOLA features contain non-finite values")
        return features, cells, shape
    finally:
        for dataset in opened.values():
            dataset.close()


def run_unsupervised_experiment(sample_count: int = 2500, clusters: int = 5, seed: int = 2026) -> dict[str, Any]:
    if sample_count < 20 or clusters < 2 or clusters >= sample_count:
        raise ValueError("Require sample_count >= 20 and 2 <= clusters < sample_count")
    run_dir, source_manifest = _latest_run()
    features, cells, raster_shape = _experiment_features(run_dir, sample_count, seed)
    scaler = StandardScaler()
    standardized = scaler.fit_transform(features)

    kmeans = KMeans(n_clusters=clusters, n_init=10, random_state=seed)
    kmeans_labels = kmeans.fit_predict(standardized)
    kmeans_silhouette = silhouette_score(standardized, kmeans_labels) if len(set(kmeans_labels)) > 1 else None

    dbscan = DBSCAN(eps=0.8, min_samples=10)
    dbscan_labels = dbscan.fit_predict(standardized)
    non_noise = dbscan_labels != -1
    dbscan_cluster_labels = set(dbscan_labels[non_noise])
    dbscan_silhouette = (
        silhouette_score(standardized[non_noise], dbscan_labels[non_noise])
        if len(dbscan_cluster_labels) > 1 and int(non_noise.sum()) > len(dbscan_cluster_labels)
        else None
    )

    isolation = IsolationForest(n_estimators=200, contamination="auto", random_state=seed)
    anomaly_labels = isolation.fit_predict(standardized)
    anomaly_scores = isolation.decision_function(standardized)

    pca = PCA(n_components=min(3, standardized.shape[1]), random_state=seed)
    projected = pca.fit_transform(standardized)
    run_id = f"mola-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid4().hex[:8]}"
    output_dir = OUTPUT_ROOT / run_id
    output_dir.mkdir(parents=True, exist_ok=False)
    table_path = output_dir / "experimental-sample.csv"
    header = [*FEATURE_LAYERS.keys(), "row", "column", "kmeans_cluster", "dbscan_cluster", "isolation_forest_outlier", "isolation_forest_score", *[f"pca_{i + 1}" for i in range(projected.shape[1])]]
    output_rows = np.column_stack([
        features, cells, kmeans_labels, dbscan_labels, anomaly_labels == -1, anomaly_scores, projected,
    ])
    np.savetxt(table_path, output_rows, delimiter=",", header=",".join(header), comments="", fmt="%.8g")
    digest = hashlib.sha256(table_path.read_bytes()).hexdigest()
    manifest = {
        "experiment_id": run_id,
        "status": "experimental-only",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_dataset": "MOLA MEGDR MEGT90N000CB",
        "processing_run": source_manifest["processing_run"],
        "source_manifest": str((run_dir / "processing-manifest.json").relative_to(PROJECT_ROOT)),
        "feature_columns": list(FEATURE_LAYERS),
        "sample_count": int(len(features)),
        "sampling": {"method": "random sample without replacement from valid processed raster cells", "seed": seed, "raster_shape": raster_shape},
        "algorithms": {
            "kmeans": {"cluster_count": clusters, "silhouette": kmeans_silhouette, "cluster_sizes": {str(label): int(count) for label, count in zip(*np.unique(kmeans_labels, return_counts=True))}},
            "dbscan": {"eps_standardized": 0.8, "min_samples": 10, "clusters_excluding_noise": len(dbscan_cluster_labels), "noise_fraction": float(np.mean(dbscan_labels == -1)), "silhouette_excluding_noise": dbscan_silhouette},
            "isolation_forest": {"n_estimators": 200, "outlier_fraction": float(np.mean(anomaly_labels == -1)), "score_semantics": "relative anomaly score; not a hazard probability"},
            "pca": {"components": pca.n_components_, "explained_variance_ratio": pca.explained_variance_ratio_.tolist()},
        },
        "output_file": table_path.name,
        "output_sha256": digest,
        "interpretation_limit": "Clusters and anomalies are exploratory statistical patterns only. They are not confirmed hazards, safety classes, or labels for supervised risk training.",
    }
    (output_dir / "experiment-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run isolated exploratory clustering on processed MOLA features")
    parser.add_argument("--sample-count", type=int, default=2500)
    parser.add_argument("--clusters", type=int, default=5)
    parser.add_argument("--seed", type=int, default=2026)
    args = parser.parse_args()
    print(json.dumps(run_unsupervised_experiment(args.sample_count, args.clusters, args.seed), indent=2))
