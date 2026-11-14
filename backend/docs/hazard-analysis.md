# Environmental hazard analysis status

## Current scope

The first hazard-analysis increment consumes the processed MOLA terrain rasters. It reports derived point metrics for terrain slope and 3 × 3-cell roughness, plus regional elevation range and summary statistics. It records the MOLA product ID, source period, source hash, coordinate convention, data quality caveat, and the fact that uncertainty has not been quantified.

This 4 pixels-per-degree MOLA grid is a historical map with approximately 14.8 km cells. The PDS label notes that some empty bins may be interpolated; it supplies no per-cell count mask. Consequently, these metrics are exploratory context only. They do not establish whether a location is safe or dangerous, do not support a rover-scale traversal decision, and are not presented as measured current conditions.

## API

- `GET /api/v1/hazards/status`: reports available and unavailable analysis inputs and whether a severity policy is configured.
- `GET /api/v1/hazards/location?latitude_deg=10&longitude_deg=0`: sample terrain metrics at a location. Latitude is planetocentric; longitude is positive east. Add `categories=terrain_slope,surface_roughness` to filter.
- `GET /api/v1/hazards/region?west_longitude_deg=-1&south_latitude_deg=-1&east_longitude_deg=1&north_latitude_deg=1`: summarize raster metrics over a bounding region. Use `categories=` to filter. Antimeridian and raster-seam windows are split during reads.

The frontend Hazard Analysis page calls the status and regional endpoints, lets the user choose among the three available MOLA metrics, and displays regional minimum, mean, maximum, valid-cell count, source product, resolution, and uncertainty caveats. The Mars Explorer separately supports click-to-query point assessments. Neither view draws hazard polygons: the API's FeatureCollection stays empty until a validated spatial classification method exists.

Categories currently computed from MOLA: `terrain_slope`, `surface_roughness`, and `elevation_variation`. Crater/depression, temperature, wind, dust, and radiation assessments are explicitly reported as unavailable without validated detection methods and source data. If processed rasters or optional geospatial dependencies are absent, the result is `insufficient-information`; no safe classification is inferred.

The API returns derived assessments and an empty hazard FeatureCollection until classification rules are configured. `severity` remains `unclassified` by default. This is intentional: no universal astronaut-safe thresholds are established by this coarse MOLA product.

## Optional classification policy

To enable a severity classification, set `MARSCOPE_HAZARD_POLICY_PATH` to a JSON file. The policy must include a unique `policy_id`, an authoritative `reference`, a rationale, intended use, a `max_cell_resolution_km` no finer than the available source supports, and a list of rules. Every rule must name a supported category, units matching the metric (`degree` for slope; `m` for roughness/elevation variation), comparison (`gt`, `gte`, `lt`, `lte`), finite numeric threshold, severity (`low`, `moderate`, `high`, `critical`), rationale, and supporting reference. Rules with an incompatible required resolution leave the result unclassified. There is no built-in policy or threshold profile.

Policy configuration is a documented extension point, not proof that supplied values are scientifically valid for human exploration. The API does not return a `safe` label. Predicted hazards and confidence scores are not implemented; observation uncertainty is reported as unquantified.
