# MOLA geospatial processing

## Setup and run

Keep the core API installation small. Install the optional geospatial dependencies from `backend/`:

```powershell
python -m pip install -r requirements-geo.txt
```

Process the sample downloaded into `data/raw/mola/`:

```powershell
python -m app.data_processing.mola --raw-dir ../data/raw/mola --output-dir ../data/processed/mola
```

The command creates a timestamped run directory with four GeoTIFFs and `processing-manifest.json`. Each chunk processes 32 rows by default; use `--chunk-rows` to tune memory use. The IMG is accessed through a read-only NumPy memory map, and output rasters are written window by window. Original PDS files are never modified. Generated raw and processed rasters are git-ignored.

`GET /api/v1/datasets/mola/processed` returns manifests and layer URLs for local processing runs, or HTTP 404 when none exist. Fetch a TIFF with `GET /api/v1/datasets/mola/processed/{run_id}/{layer_id}`, where `layer_id` is `elevation`, `slope`, `aspect`, or `roughness`. The API does not start processing automatically.

## Outputs

| Output | Units | Method |
| --- | --- | --- |
| `mola_topography_m.tif` | m | Source median topography relative to MOLA areoid, copied from PDS IMG |
| `terrain_slope_deg.tif` | degrees | Centered finite differences with spherical equirectangular east-west spacing |
| `terrain_aspect_deg.tif` | degrees | Downslope direction clockwise from north; flat cells use NoData |
| `terrain_roughness_std_m.tif` | m | Population standard deviation over a 3 × 3 cell neighborhood |

GeoTIFF CRS, transform, and tags are built from the PDS4 label: planetocentric latitude, positive-east longitude, equirectangular projection, central meridian 180°, and the labeled 3,396 km spherical radius. The pixel origin also comes from the label. The `mars_coordinates` helpers distinguish planetocentric latitude from geodetic latitude; GeoJSON coordinates wrap east longitude into `[-180, 180)` and add convention metadata.

## Algorithms and limits

For each cell, the slope is `atan(sqrt((dz/dE)^2 + (dz/dN)^2))`. East-west ground spacing is the labeled equatorial pixel spacing multiplied by `cos(latitude)`; north-south spacing uses the labeled y pixel scale. The slope implementation uses centered differences and wraps neighboring columns across the global longitude seam. At the polar rows the equirectangular neighborhood is geometrically distorted, so derived terrain values there need special caution.

Aspect is the downhill azimuth derived from the same gradients, with 0° north and 90° east. Roughness is the standard deviation of the nine topography samples in a 3 × 3 window. At the north and south raster edges, the nearest row is repeated to complete the window. Longitude wraps at the seam.

The PDS product label explains that empty bins may contain interpolated values, but this topography product does not contain an observation-count mask. The pipeline therefore retains source cells and flags this limitation in every product; it cannot distinguish measured from interpolated cells. The source is historical (1997–2001), the resolution is ~14.8 km per cell, and the roughness window spans multiple tens of kilometers. These products are exploratory map layers, not current conditions, a rover-scale terrain model, a mobility model, or a safety/hazard classification. No resampling, clipping, slope thresholds, crater detection, or risk labels are applied.

## Checks

Install test and geospatial dependencies with `python -m pip install -r requirements-test.txt`, then run `python -m pytest tests`. Coordinate and synthetic algorithm checks always run. Tests using the genuine MOLA sample skip with an explicit reason if the git-ignored raw sample is absent; when present, they validate the PDS/manifest hashes, process the source, and open the produced GeoTIFFs.
