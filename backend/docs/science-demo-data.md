# Science demo data

`GET /api/v1/science/demo` serves interface fixtures for sections whose live scientific inputs are not connected or do not support the requested assessment yet.

Every returned item has `synthetic: true` and `operational_use: false`. The API response also sets `risk_route_hazard_inputs: false`. These records are never read by the hazard, risk, route, or astrobiology map calculations. Their example values and scores are invented UI fixtures, not Mars measurements or model predictions.

The fixtures cover atmospheric context (MCD, MEDA-shaped, and MCS-shaped rows), environmental-hazard presentation (MARCI-shaped context, RAD-shaped row, and a synthetic hazard scenario), AI4MARS terrain class display, habitability factors, biosignature categories, and settlement suitability. No demo scenario is assigned Mars coordinates or plotted as an observation.

`source_url` values are topical or dataset references to help identify the intended source family. They do not supply or substantiate the synthetic sample values. Live archive product search and metadata remain separate from these fixtures.

The frontend displays them in amber demo panels on Mars Explorer, Hazard Analysis, Risk Assessment, and Mission Reports. Crew tracking and survival monitoring have separate, user-enabled local demo modes. All demo displays must retain a visible demonstration label and must not flow into operational calculations.
