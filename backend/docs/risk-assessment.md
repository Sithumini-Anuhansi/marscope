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

No scikit-learn, SHAP, or joblib inference code is enabled until such data and a reviewed model are available. Loading arbitrary serialized Python objects is intentionally avoided.
