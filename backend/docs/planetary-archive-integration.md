# Live Mars archive discovery

Mars Explorer asks NASA's Planetary Data System Geosciences Node, Mars Orbital Data Explorer (ODE), for products whose footprints intersect a 20 km half-width around the selected map point. The API returns up to three product records per source for:

| MARSCOPE source | ODE mission/instrument/product type | Product content |
| --- | --- | --- |
| THEMIS | ODY / THEMIS / IRGEO2 | Registered, atmospherically corrected calibrated radiance images |
| CTX | MRO / CTX / EDR | Individual grayscale Context Camera images |
| HiRISE | MRO / HIRISE / DTM | Stereo-derived, map-projected elevation rasters |
| CRISM | MRO / CRISM / TRDR | Targeted hyperspectral reduced data records |
| SHARAD | MRO / SHARAD / RDR | Orbital subsurface radar sounding records |

`GET /api/v1/science/products` takes `latitude_deg`, `longitude_deg`, and optional `radius_km` (1–500). Mars ODE uses areocentric latitude and 0–360° positive-east longitude. The Explorer converts a globe-picked Cesium geodetic latitude to planetocentric before calling the API. The radius is approximated as a geographic bounding box; it is not an exact circular footprint.

Each source result contains the PDS data-set ID, product ID, product type, a browse URL when the archive supplies a JPEG/PNG, a direct data-file URL, and caveats about what those products mean. The Explorer renders the preview and links to the archive file. It does not fetch large PDS files into the workspace automatically.

The endpoint caches successful or unavailable ODE results in process memory for 15 minutes. If ODE returns an error or cannot be reached, the source gets an explicit error status; that status is not reported as zero planetary coverage. ODE queries are performed concurrently and are read-only.

## Current boundary

This integration discovers and previews real PDS products; it does not reproject their raster data into Cesium, derive hazard measurements from browse images, or use them as route costs. Product file links may point to large PDS products with detached labels. HiRISE DTM elevation, CRISM reflectance, THEMIS radiance, and SHARAD radar returns require their product-specific labels, units, calibration, projection, and validation before scientific measurements can be computed.

ODE location queries are not currently supported for every source. MCD, MARCI, MCS, RAD, and AI4MARS remain outside the orbital product endpoint; MEDA now has a separate site-specific index endpoint below. In particular, MEDA is a Perseverance/Jezero-site weather record, RAD is Curiosity-site radiation, and MCD output is a modeled climatology; none should be misrepresented as a current Gale surface measurement.

## MEDA calibrated archive index

MARSCOPE includes an explicit ingestion command for the official PDS Atmospheres Node MEDA calibrated air-temperature (ATS) CSV index:

```powershell
cd backend
python -m app.services.meda_ingestion
```

The command downloads the small index to `data/raw/meda/`, checks its CSV schema and MEDA product URNs, and writes a SHA-256 provenance manifest. `GET /api/v1/science/meda/index` serves the locally ingested index summary and a limited latest-first list of archive records. The index lists per-sol measurement files; it does **not** contain measured temperatures. Values require retrieving the referenced MEDA product CSVs and interpreting their labels. All records are Perseverance site-local, historical measurements and are not extrapolated to other Mars coordinates or presented as current weather. Raw files are ignored by Git, so each checkout must run the ingestion command to enable this endpoint.

NASA describes MEDA calibrated products and per-sensor indexes in the [PDS Atmospheres MEDA archive](https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html). The [Mars Climate Database access page](https://www-mars.lmd.jussieu.fr/mars/access) says the web interface is for moderate use, while the full NetCDF package requires registration and includes license conditions; MCD is still not ingested. [MARCI daily global mosaics](https://pds.nasa.gov/ds-view/pds/viewBundle.jsp?identifier=urn%3Anasa%3Apds%3Amars_mro_marci_dailyglobalmosaics_wang_2023&version=2.0), [MCS monthly profile volumes](https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/MARS/mcs.html), [RAD RDR data](https://pds-ppi.igpp.ucla.edu/collection/MSL-M-RAD-3-RDR-V1.0%3ADATA), and [AI4MARS](https://catalog.data.gov/dataset/ai4mars-a-dataset-for-terrain-aware-autonomous-driving-on-mars) still require source-specific retrieval and processing. The PDS AI4MARS catalog points to the published dataset distribution; the existing local trainer requires a reviewed license, verified archive manifest, and curated split index before training.

## Demo-only records

`GET /api/v1/science/demo` provides obviously synthetic example records for MCD, MEDA, MARCI, MCS, RAD, and AI4MARS so the UI can demonstrate how these source types may be presented. Every response is tagged `DEMO ONLY`; the frontend uses a high-contrast demo panel and calls out that the values are not NASA observations, measurements, or model outputs. These fixtures are isolated in `science_demo_service.py`, and must never be fed into hazard/risk/route services, model training, or scientific results. They are interface examples only.

Mars Explorer also shows three published exploration anchors on the globe: Jezero, Gale, and Utopia Planitia/Viking 2. They are reference locations for mission and regional research context. The Utopia marker is specifically the historic Viking 2 landing coordinate; it is not the footprint center or boundary of the broader SHARAD water-ice study. None of the points encodes a hazard boundary, a habitability score, or evidence that life exists.

Official references: [PDS ODE REST API](https://ode.rsl.wustl.edu/mars/tools.aspx), [ODE REST manual](https://oderest.rsl.wustl.edu/ODE_REST_V2.1.6.pdf), [HiRISE DTM product description](https://ode.rsl.wustl.edu/mars/pagehelp/Content/Missions_Instruments/Mars%20Reconnaissance%20Orbiter/HiRISE/HiRISE%20DTM.htm), [THEMIS products](https://ode.rsl.wustl.edu/mars2/pagehelp/Content/Missions_Instruments/Mars_Odyssey/THEMIS/Derived.htm), [CTX EDR](https://ode.rsl.wustl.edu/mars/pagehelp/Content/Missions_Instruments/Mars%20Reconnaissance%20Orbiter/CTX/CTX%20EDR.htm).
