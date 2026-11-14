# Route planning

## Scope and current data readiness

The route planner runs A* over validated processed elevation, slope, and roughness GeoTIFFs. It supports a mission-specified maximum accepted cell size, optional maximum slope, configurable slope/roughness cost weights, a selected route objective, alternatives, and optional astronaut assignment. Route results are cached in process memory (50 requests) and are lost at API restart.

The only current product is the global MOLA MEGDR sample at approximately 14.817845 km/cell. This is much coarser than a local EVA mobility map. The frontend defaults the accepted source limit to 5 km/cell, so the current source is rejected and no route geometry is drawn. A user can explicitly accept coarser data to produce a *limited terrain-cost candidate*. That candidate is not a traversability or safety recommendation.

## Cost and constraints

The planner uses 8-connected grid A*. Route distance includes the requested endpoints and the snapped raster-cell centers; grid edge distance is the Mars spherical great-circle distance. Edge cost is:

```text
distance_km * (1 + slope_penalty_per_degree * mean_slope_deg
                 + roughness_penalty_per_meter * mean_roughness_m)
```

Weights are required caller inputs. They are preferences for comparing routes, not a calibrated astronaut mobility model, danger probability, or survival score. The optional maximum-slope value is also a caller-supplied mission constraint, not a universal safe-slope threshold. Alternative searches discourage previously selected route interior cells; fewer alternatives may be returned if distinct paths do not exist.

When a reviewed, cited hazard policy is configured and compatible with the raster resolution, the planner can avoid cells classified high/critical by slope or roughness rules. Missing policy or environmental hazards remain explicitly unavailable. The system does not treat unknown cells as safe, estimate travel time, or calculate mission-success probability. Raster source resolution and quality notes accompany each result. Antimeridian-crossing geometries use GeoJSON `MultiLineString` output.

## API

- `GET /api/v1/routes/status` reports the selected processed source and hazard-data limitations.
- `POST /api/v1/routes/generate` generates a recommendation and up to two alternatives.
- `GET /api/v1/routes/{route_request_id}` retrieves a recent cached request result.
- `POST /api/v1/routes/compare` compares two or more cached route requests. Distances and costs are comparable only when requests use the same source and cost settings.

Example request (caller must explicitly choose source tolerance and cost weights):

```json
{
  "start": {"latitude_deg": 0, "longitude_deg": 0, "latitude_type": "planetocentric", "longitude_direction": "positive-east"},
  "destination": {"latitude_deg": 1, "longitude_deg": 1, "latitude_type": "planetocentric", "longitude_direction": "positive-east"},
  "maximum_source_cell_km": 5,
  "slope_penalty_per_degree": 0.1,
  "roughness_penalty_per_meter": 0.01,
  "avoid_policy_classified_high_hazards": true,
  "alternative_count": 2,
  "mission_objective": "balanced"
}
```

With the current 14.8 km/cell MOLA source, this request returns `status: unavailable` and the resolution reason. The API returns no route, distance, or travel estimate when the accepted resolution is exceeded.

## Frontend

The Route Planning page has a Mars globe, map-click start/destination selection, coordinate entry, source-resolution and slope constraints, caller-entered cost weights, mission objective and astronaut assignment. It draws only returned route geometries, lets the user inspect recommendation/alternatives, displays distances and terrain summaries, and provides a reset control. No route is drawn for an unavailable result. The globe imagery still depends on the external NASA tile service.
