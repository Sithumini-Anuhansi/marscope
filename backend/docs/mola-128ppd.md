# MOLA 128 ppd local terrain study windows

MARSCOPE can optionally ingest the official NASA PDS Geosciences Node MOLA MEGDR 128 pixels/degree topography tiles. This adds a roughly 463 m equatorial grid (about 32 times finer than the app's 4 ppd global sample), plus the matching per-cell MOLA observation-count tile. It is still much too coarse to establish rover or EVA safety.

The app does not download these large tiles on startup. Download only the tile containing the area you intend to inspect. A topography tile is about 124 MiB and its count tile about 62 MiB; both are retained with their PDS labels and SHA-256 checksums.

From `backend/` in PowerShell:

```powershell
python -m app.services.mola_128_ingestion --latitude -4.5 --longitude 137.4
python -m app.data_processing.mola_128 --latitude -4.5 --longitude 137.4
```

The default output is a 1° by 1° window around the supplied position. Set `--half-window-degrees` to a value greater than 0 and no more than 2 to adjust the bounded crop. Source rasters and the counts mask are preserved; zero-count cells are NoData in derived terrain rasters. The observation-count layer remains available separately.

Processed manifests and GeoTIFFs are exposed under `/api/v1/datasets/mola-128ppd/processed`. Route candidates use the finest available validated MOLA window only when both requested endpoints fall inside its recorded study window; otherwise they use the global sample, subject to the request's source-resolution limit. A route remains a terrain-weighted planning candidate, never a safety recommendation. No hazard labels, weather, dust, radiation, or current conditions are inferred from MOLA.

Official source: [NASA PDS Geosciences Node MOLA MEGDR bundle](https://pds-geosciences.wustl.edu/missions/mgs/megdr.html).
