# Hybrid AI and risk foundations

## Component A: AI4MARS terrain segmentation

### Dataset investigation

The NASA Open Data record describes the original AI4MARS release as about 35,000 Curiosity, Opportunity, and Spirit images, about 326,000 crowdsourced segmentation labels, and about 1,500 expert labels from rover planners/scientists. The Zenodo edition associated with DOI `10.5281/zenodo.15995036` reports about 50,000 images and 425,000 labels across Perseverance, Curiosity, Opportunity, and Spirit. These counts differ because the records describe different dataset editions and merged/unmerged contents. Record the exact edition and archive checksum used by each model.

The navigation taxonomy supported by this implementation is the four-class AI4MARS taxonomy: pixel IDs `0` soil, `1` bedrock, `2` sand, `3` big rock; `255` is unlabeled/ignore. Updated AI4MARS Perseverance geology masks use a distinct beta taxonomy and are excluded from this four-class navigation model. The implementation verifies the selected taxonomy against each mask rather than silently remapping it.

The NASA Open Data record says its license is unspecified. The Zenodo update records copyright 2022 IEEE. MARSCOPE does not auto-download, redistribute, or bundle either archive. Before local use, obtain the archive from the official source, review the applicable terms with the project owner, and record that review and notes in the local manifest. The training inspector refuses a manifest whose license review is pending.

Sources: [NASA Open Data AI4MARS record](https://data.nasa.gov/dataset/ai4mars-a-dataset-for-terrain-aware-autonomous-driving-on-mars), [original AI4MARS paper](https://openaccess.thecvf.com/content/CVPR2021W/AI4Space/html/Swan_AI4MARS_A_Dataset_for_Terrain-Aware_Autonomous_Driving_on_Mars_CVPRW_2021_paper.html), [AI4MARS Zenodo v0.6](https://zenodo.org/records/15995036), [NASA/JPL SPOC](https://nasa-jpl.github.io/SPOC/).

### Local dataset layout and inspection

No archive is checked into this repository. After license review and extraction, create `data/ai4mars/dataset-manifest.json` and an index CSV. The CSV columns are:

`image_path,mask_path,split,group_id,rover,label_source`

Paths are relative to the dataset root. `split` must be `train`, `validation`, or `expert_test`; the expert split must use `label_source=expert`. `group_id` should identify the rover sequence/site or another meaningful geographic group, not just a random row. A group may occur in one split only. The inspector checks image decoding, JPEG/PNG image format, indexed/grayscale PNG masks, dimensions, supported pixel IDs, non-empty masks, expert split provenance, and group leakage. It also reports class pixel counts per split.

Required manifest fields: `dataset_id: "AI4MARS"`, exact `dataset_version`, `archive_name`, archive `archive_md5`, `license_review_status: "reviewed"`, `license_notes`, `selected_task: "navigation"`, `label_encoding` mapping IDs 0–3 and 255, `image_format`, and `mask_format`. Include `label_agreement` and `expert_validation` notes from the exact edition's documentation.

Run inspection from `backend/` after installing vision dependencies:

```powershell
python -m pip install -r requirements-vision.txt
python -c "from app.ml.ai4mars_dataset import inspect_ai4mars_package; import json; print(json.dumps(inspect_ai4mars_package('../data/ai4mars', '../data/ai4mars/index.csv'), indent=2))"
```

### Terrain segmentation candidate

The optional training script uses DeepLabV3 with a ResNet-50 backbone and no downloaded pretrained weights. It applies ImageNet input normalization, nearest-neighbor mask resizing, ignore index 255, and class weights computed only from the real training masks. It requires group-disjoint train, validation, and reserved expert-test splits. Validation mean IoU selects the checkpoint; expert-test metrics are computed after selection and are not used for tuning. Metrics include pixel accuracy, per-class precision/recall/F1/IoU, macro scores, and confusion matrix.

```powershell
python -m app.ml.ai4mars_training --dataset-root ../data/ai4mars --index ../data/ai4mars/index.csv --version ai4mars-nav-0.1 --epochs 12 --batch-size 4 --device auto
```

The output is a local candidate under `ml-models/terrain/<version>/`, and the weight file is git-ignored. It is not served until a reviewer records `model_approval` in the manifest and sets `deployment_status` to `approved`, then configures `MARSCOPE_TERRAIN_MODEL_VERSION`. The API loads only the explicit locally approved state-dict artifact after checking its SHA-256. Softmax values are uncalibrated. Predictions describe image material only, have no geolocation unless validated pose is supplied, and do not create hazard/risk labels.

At present no AI4MARS archive, index, or trained terrain checkpoint is installed in this workspace, so no model metrics are claimed.

## Component B: environmental risk indicators

The current environmental service reuses processed MOLA elevation, slope, roughness, and regional elevation summaries. Each metric includes source product/period, units, resolution, method, data-quality caveat, and unquantified uncertainty. THEMIS, CTX, HiRISE and atmospheric source products are catalogued, but their measurements are not claimed locally available. Crater, temperature, wind, dust, and radiation inputs stay unavailable until suitable product data and processing are connected.

The existing hazard policy mechanism is the only path to rule-derived severity. Rules require citations, rationale, intended use, units, severity, and a resolution ceiling. Rule results remain identified as rule-derived, not ground truth. No defaults are introduced by this AI service.

## Component C: explainable risk synthesis

`POST /api/v1/ai/risk/assess` combines MOLA indicators, optional cached terrain-classification output, crew-reported context, mission constraints, source details, and missing-data statements. AI4MARS classes remain an independent visual context and do not affect hazard severity. Crew observations and mission constraints are marked caller-supplied/unverified. The overall result is `unclassified`; it does not return safe/unsafe or survival-probability values. A rule-based limited status appears only if an explicitly configured cited policy generated a classification.

## Experimental unsupervised analysis

Run the optional K-Means, DBSCAN, Isolation Forest, and PCA analysis only from an existing processed MOLA run:

```powershell
python -m app.ml.unsupervised_terrain --sample-count 2500 --clusters 5 --seed 2026
```

The script selects actual valid raster cells, standardizes the elevation/slope/roughness inputs, and saves sample assignments and diagnostics under `data/experimental/unsupervised/`. K-Means reports silhouette and sizes; DBSCAN reports cluster/noise counts and silhouette where defined; Isolation Forest reports relative anomaly fraction; PCA reports explained variance. Outputs are isolated from operational hazard endpoints and carry an explicit interpretation warning. They are never hazard labels.

No supervised unsupervised experiment was run in this workspace during implementation; the pipeline has not been invoked here.

## API and future risk-model contract

- `GET /api/v1/ai/status`: component readiness and limitations.
- `GET /api/v1/ai/models`: model/candidate status without loading weights.
- `POST /api/v1/ai/terrain/classify`: JPEG/PNG image body; returns pixel-class coverage and a PNG mask when an approved model exists, otherwise an explicit unavailable response.
- `POST /api/v1/ai/risk/assess`: location, optional terrain assessment ID, mission constraints, and crew observations; returns a provenance-aware synthesis.

Supervised environmental/human-risk prediction remains untrained. A future dataset must have spatially referenced, operationally defined hazard labels; documented independent annotation and review; relevant time-aligned features with provenance, units, coverage, resolution, and uncertainty; negative and positive examples across independent sites; and an independent spatial/temporal validation set. Report per-class precision/recall/F1, confusion matrices, calibration only when statistically supported, and model/domain limitations. Do not derive these labels from AI4MARS material classes or from unsupervised clusters.
