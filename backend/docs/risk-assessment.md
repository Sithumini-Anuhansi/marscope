# AI/ML risk assessment readiness

## Current state

There is no labeled Mars exploration-risk training dataset or validated ML model in this repository. The available MOLA sample is historical global topography at approximately 14.8 km per cell; it is not labeled with astronaut/rover outcomes and cannot by itself provide a calibrated risk score, survival probability, or model confidence. No training or evaluation results are claimed, and model artifacts are not loaded.

The service therefore returns an explicit `unavailable` / `unclassified` result by default. It never fabricates a prediction, numeric score, model version, or confidence value. Feature inputs are validated, but their source identity and correspondence to the requested location are caller-provided and not independently checked.

## Rule-based baseline

If the same cited, resolution-aware policy used by the terrain hazard service is configured through `MARSCOPE_HAZARD_POLICY_PATH`, the endpoint may return a `rule-based-limited` classification for matching terrain measurements. This is explicitly separate from machine learning. It returns no numeric risk score because the project has no calibrated score mapping. A combined baseline classification is withheld when the terrain feature observation periods differ. Environmental inputs without configured policy rules remain unclassified.

## API

- `GET /api/v1/risk/status` reports model, dataset, and baseline readiness without loading model files.
- `POST /api/v1/risk/assessments` accepts a Mars planetocentric location and feature measurements with required units, source names, observation periods, and resolution. It returns classification status, contributing features when policy rules match, missing inputs, explanation, model version, score, and uncertainty fields.
- `GET /api/v1/risk/assessments/{assessment_id}` retrieves one of the most recent 100 results from process memory. Results are lost when the API restarts; they are not persisted to disk or a database.

Supported inputs are terrain slope (degree), surface roughness (m), elevation variation (m), temperature (K), wind speed (m/s), and dust opacity (unitless). Validation checks units, numerical ranges, and timezone-aware observation periods. It cannot validate whether client-supplied science data is authentic or co-located. The service records feature periods separately and will not combine different terrain periods into one baseline class.

## Model readiness requirements

Before adding an ML model, the project needs a traceable labeled dataset with a clearly defined target (what “risk” means), source product IDs and time/space coverage, appropriate positive and negative examples, and a validation split that avoids spatial leakage. Evaluation must report suitable precision/recall/F1 and confusion matrices; calibration and uncertainty should be included only if methodologically supported. Feature preprocessing, training data reference, target definition, model version, evaluation results, and intended use must be documented. User observations must not be treated as validated labels without review.

## Offline candidate training pipeline

Install optional ML dependencies from `backend/`:

```powershell
python -m pip install -r requirements-ml.txt
```

Prepare a reviewed CSV outside the repository. It must contain the configured numeric feature columns, `latitude_deg`, `longitude_deg`, a timezone-aware observation-time column, a spatial-group column (for example, site/region/mission ID), and the target label. Do not fabricate labels or treat unreviewed user observations as ground truth. The adjacent JSON manifest must include:

- `dataset_id`, `source`, `source_url`, and `citation`;
- `target_column`, a clear `target_definition`, and the complete `class_labels` list;
- `feature_units`, a mapping from supported feature names to API units;
- `feature_resolution_km`, a min/max resolution range for every feature;
- `feature_sources`, a list of allowed `{ "source_dataset", "source_product_id" }` pairs for every feature;
- `spatial_group_column` and `observation_time_column` names;
- `review_status: "approved-for-training"`, `reviewed_by`, `intended_use`, and the CSV `sha256`.

Example manifest shape (replace every placeholder with real reviewed metadata):

```json
{
  "dataset_id": "<traceable-dataset-id>",
  "source": "<archive or reviewed field dataset>",
  "source_url": "<official source URL>",
  "citation": "<dataset citation or DOI>",
  "target_column": "risk_label",
  "target_definition": "<operational definition of each label>",
  "class_labels": ["<class-a>", "<class-b>"],
  "feature_units": {"terrain_slope": "degree", "surface_roughness": "m"},
  "feature_resolution_km": {"terrain_slope": {"min": 14.8, "max": 14.9}, "surface_roughness": {"min": 14.8, "max": 14.9}},
  "feature_sources": {"terrain_slope": [{"source_dataset": "<dataset-id>", "source_product_id": "<product-id>"}], "surface_roughness": [{"source_dataset": "<dataset-id>", "source_product_id": "<product-id>"}]},
  "spatial_group_column": "region_id",
  "observation_time_column": "observation_time_utc",
  "review_status": "approved-for-training",
  "reviewed_by": "<reviewer or team>",
  "intended_use": "<bounded research or decision-support use>",
  "sha256": "<SHA-256 of the exact CSV file>"
}
```

Train a candidate, using a version that does not already exist:

```powershell
python -m app.ml.training --csv path/to/reviewed.csv --manifest path/to/dataset-manifest.json --version mars-risk-0.1.0
```

The CLI rejects mismatched hashes, missing labels, unsupported features, invalid coordinates, too few spatial groups, classes confined to one region, or splits that cannot hold out all classes by region. It uses a spatially disjoint 80/20 holdout and reports macro precision/recall/F1, weighted F1, confusion matrix, and holdout permutation importance. It writes a `candidate` under `ml-models/<version>/`; the candidate is not used by the API. Calibration is not performed, so the API exposes no numerical risk score or confidence.

Before enabling a candidate, review the underlying dataset and evaluation, then record explicit model approval in `model-manifest.json` (`deployment_status: "approved"` and `model_approval` with `status: "approved"`, `reviewed_by`, and a review date). Configure `MARSCOPE_RISK_MODEL_VERSION` to that version when starting the API. The service checks the local artifact hash, feature contract, spatial training bounds, feature ranges, and observation-time period before inference. Keep model artifacts from trusted local training only: joblib files are executable Python serialization and must never be loaded from an untrusted source.

Prediction classes use the registered target definition. The API withholds predictions outside documented feature/time/spatial ranges. It reports global permutation importance separately; that measure describes held-out model behavior and is not a local explanation for an individual prediction. A numeric score, calibrated confidence, or mission-success probability remains unavailable unless separately defined and validated.
