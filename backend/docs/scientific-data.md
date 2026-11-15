# Scientific data integration status

## MOLA MEGDR sample

The ingestion utility fetches only the 4 pixels-per-degree global MOLA topography image (`MEGT90N000CB`) and its PDS4 XML label. The IMG is 2,073,600 bytes (720 × 1440 cells, signed 16-bit big-endian meters). This is a deliberately low-resolution sample, not a rover-scale navigation DEM. The PDS label gives 14.817845349 km/pixel in both axes.

Run the download explicitly from `backend/` after installing requirements:

```powershell
python -m app.services.mola_ingestion --raw-dir ../data/raw/mola
```

Raw files are retained unchanged. A JSON manifest records source URLs, hashes, source period, conventions, and structural validation. The downloader checks image length and parses the XML label, but does not verify an archive-provided checksum or quality-assess elevations. It does not run at API startup. If a download fails, staged temporary files are discarded; an earlier completed copy is retained. See [geospatial-processing.md](geospatial-processing.md) for label-driven GeoTIFF processing.

The grid reports median topography per 0.25° bin relative to the MOLA areoid; the label says empty bins may be interpolated. Do not treat this old global dataset as current environmental conditions. The PDS4 product label gives a geometry span from 1997-09-15 through 2001-06-30. It specifies IAU2000_MARS planetocentric latitude, positive-east longitude, and an equirectangular projection with central meridian 180°. The ingest manifest copies these values from the product label.

## Other products

- The Mars Explorer queries NASA PDS Mars ODE for footprint-matched THEMIS IR-GEO v2, CTX EDR, HiRISE DTM, CRISM targeted TRDR, and SHARAD RDR products around its current map point. It displays PDS browse previews and direct archive file links. ODE searches are live and cached for 15 minutes; a result is archive discovery, not a local download or validated map overlay.
- The registry marks those five entries `live-pds-coverage-and-browse-discovery`, while keeping `downloaded` and `validated` false. Their raw products are not yet parsed into app hazard metrics or route costs. The remaining catalog entries (MCD, MEDA, MARCI, MCS, RAD, AI4MARS) still need their separate archive/query and processing workflows.
- API: `GET /api/v1/science/products?latitude_deg=-4.876&longitude_deg=137.303&radius_km=20`. Coordinates are areocentric latitude and positive-east longitude as expected by Mars ODE. The results are historical product footprints within an approximate bounding box; sensors' acquisition times need not match. Products without a location-search interface are not inferred as absent from the planet.
- Product-file links can be hundreds of megabytes. The application does not download them automatically. A browse preview is not a substitute for the PDS product and label, and a matching footprint does not imply continuous image coverage or current surface conditions. See [planetary-archive-integration.md](planetary-archive-integration.md).
- Feature mapping (the registry's `feature_usage` field is the machine-readable source of truth):

| MARSCOPE feature | Intended data sources | What the feature may claim |
| --- | --- | --- |
| Where Am I | MOLA; mission location/crew reports | MOLA-derived terrain context at its coarse resolution; mission records are app data. |
| Nearby | CTX and selected HiRISE imagery; THEMIS; CRISM and SHARAD evidence; MOLA | Image/context and geologic evidence only where scene footprints cover the selected location. |
| Safety and risk assessment | MOLA; THEMIS; MCD; MEDA; MARCI; MCS; RAD | Evidence must retain source, time, units, location, and observation/model type. No source alone creates a validated safety verdict. |
| Mars Explorer | MOLA, THEMIS, CTX, HiRISE, MARCI | Rendered layers must preserve footprints, acquisition dates, and imagery-vs-measurement semantics. |
| Hazard analysis | MOLA; selected HiRISE; THEMIS; CRISM and SHARAD | No hazard polygon/classification is asserted until a reviewed rule and product coverage are implemented. |
| Route planning | MOLA; CTX/HiRISE; AI4MARS within rover-image scope; selected CRISM/SHARAD and environmental evidence | Candidate routes remain conditional on resolution, coverage, and mission constraints; AI4MARS classes are not astronaut hazard labels. |
| Mission planning | MCD, MEDA, MARCI, MCS, RAD plus mission specifications and logs | Distinguish modeled climatology from historical site observations; RAD is Curiosity-site context, not a global radiation map. |
| Crew, observations, and resources | MARSCOPE mission records | These are user/mission records, not NASA archive measurements. |
| Solar system and return planning | JPL Horizons/SPICE and declared spacecraft/mission parameters | Orbital context and mission assumptions only; no current vehicle performance is inferred from planetary datasets. |

- Additional sources retain their separate use limits: MCD is model climatology, MEDA samples Perseverance at Jezero, MARCI is dated orbital imagery, MCS is orbital atmospheric profiles, and RAD is Curiosity-site surface radiation. These sources are not returned by the current location-search service. Do not combine different epochs as if simultaneous. A SHARAD return is not proof of accessible ice; CRISM composition is not a crew-risk label.
- HiRISE and CTX coverage is scene/mosaic dependent. Do not advertise global high-resolution coverage. AI4MARS labels come from rover imagery and do not transfer directly to orbital scenes or astronaut hazard classes.
- THEMIS IR-GEO v2 products in the location search are calibrated radiance imagery, not direct surface-temperature values. Temperature requires a suitable brightness-temperature product and PDS label/scale. NASA Mars Trek offers RESTful WMTS layers; each layer's capabilities and browser tile behavior must be confirmed before it is treated as a map overlay.
- The MOLA sample is detected by the API registry from its local manifest. Its status means downloaded and structurally validated; it does not mean scientific quality was independently assessed.
- The frontend catalogs NASA Mars Trek Viking MDIM and MOLA color shaded-relief WMTS layers. The MOLA WMTS is a rendered hillshade, not elevation measurements or a terrain mesh. Cesium runtime tile errors are now attributed to the layer that raised them and shown beside that layer. This catches browser network/CORS/service failures at runtime, but visual landmark alignment still needs a human review in the running app.
- The Murray Lab CTX via Esri OnMars entry is marked beta because the app has not yet verified projection alignment against known Mars landmarks. The global PDS mosaic itself is multi-terabyte; use scene/browse products or the tile cache for an initial implementation.

## Authoritative references

- [NASA PDS Geosciences Node: MGS MOLA archive and PDS4 bundle](https://pds-geosciences.wustl.edu/missions/mgs/mola.html)
- [NASA PDS MEGDR collection: 128 pixels per degree](https://pds.nasa.gov/ds-view/pds/viewCollection.jsp?identifier=urn%3Anasa%3Apds%3Amgs_mola_topography_derived%3Adata_meg128)
- [PDS Geosciences Node: MOLA MEGDR format and product naming](https://ode.rsl.wustl.edu/mars/pagehelp/Content/Missions_Instruments/MGS/MOLA/MEGDR.htm)
- [NASA Mars Trek WMTS API and layer services](https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars)
- [PDS THEMIS IR-GEO V2 product description](https://pds.nasa.gov/ds-view/pds/viewDataset.jsp?dsid=ODY-M-THM-5-IRGEO-V2.0)
- [PDS Murray Lab global CTX mosaic v1 bundle](https://pds.nasa.gov/ds-view/pds/viewBundle.jsp?identifier=urn%3Anasa%3Apds%3Amars_mro_ctx_globalmosaicv01_murraylab_2023&version=1.0)
- [PDS MRO MARCI daily global mosaics](https://pds.nasa.gov/ds-view/pds/viewBundle.jsp?identifier=urn%3Anasa%3Apds%3Amars_mro_marci_dailyglobalmosaics_wang_2023&version=2.0)
- [PDS MRO Mars Climate Sounder Level 4 data set](https://pds.nasa.gov/ds-view/pds/viewProfile.jsp?dsid=MRO-M-MCS-4-RDR-V1.0)
