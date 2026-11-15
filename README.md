# MARSCOPE

### Interplanetary Survival and Mars Exploration Companion

**Explore the unknown. Understand your surroundings. Plan the next step.**

Developed by **Team ANORA** for the NASA Space Apps Challenge.

## Project links

- **Project repository:** [github.com/Sithumini-Anuhansi/marscope](https://github.com/Sithumini-Anuhansi/marscope)
- **Seven-slide project demonstration:** [Google Slides](https://docs.google.com/presentation/d/1dts4-IvVR_BkmmEoPLKNQgvCVmyoqI0A5KdsTGIEVDY/edit?usp=sharing)

## Summary

MARSCOPE is an interactive Mars exploration and mission-support app built to help crews and mission planners examine surface locations and organize exploration. Its Marswalk map brings together available planetary imagery, terrain information, named features, crew reports, and points of interest. Users can inspect Gale Crater and other mapped regions, review nearby observations, and explore route-planning, hazard, survival, and crew-tracking tools.

The project addresses the challenge of turning scattered Mars data into a localized view that can support planning a surface excursion. It combines available NASA and planetary datasets with clear source and readiness information, and uses visibly labeled demo data where live mission data is unavailable. This distinction matters: Mars terrain measurements and crew reports can inform exploration, but they do not automatically establish that a place is safe. MARSCOPE provides an accessible foundation for exploring the data and identifying what is known, missing, or still needs validation before operational use.

## What the app does

MARSCOPE combines an interactive 3D Mars globe with a Solar System location view and mission-support pages. Users can set a manual or demo location, inspect named Mars features and nearby science context, explore map layers, and review source status. Supporting workflows include:

- **Where Am I:** Solar System context, nearby bodies and objects, selectable location sources, Gale Crater demo location, crew context, and survival-resource overview.
- **Mars Explorer:** Mars map layers, named surface features, clickable points with descriptions, NASA PDS product search and browse previews, and contextual science layers.
- **Hazard and risk assessment:** MOLA-derived terrain metrics and source/readiness reporting. Hazard severity remains unclassified until reviewed data and defensible rules are available; no supervised human-risk model is deployed.
- **Route planning and return feasibility:** exploratory route candidates and mission-assumption workflows. They are planning aids, not certified or safety-validated trajectories.
- **Crew tracking, collaborative mapping, mission reports, and survival resources:** connected service workflows with clearly identified sample records where live mission telemetry or operational records are unavailable.
- **Settings and data readiness:** service connection state, last-checked times, source status, and demo/live distinctions.

## Data status and limitations

MARSCOPE separates downloaded and processed datasets, live archive discovery, source references, and illustrative demo records:

- The MOLA processing workflow uses the historical global 4 pixels-per-degree product, approximately 14.8 km per cell. It provides regional terrain context, not rover-scale mobility or current environmental conditions. Optional finer MOLA tiles must be explicitly downloaded and still do not establish crew safety.
- NASA PDS Mars Orbital Data Explorer searches can return real THEMIS, CTX, HiRISE, CRISM, and SHARAD product records, browse previews, and archive links. The app does not automatically download or process those products into hazard layers or route costs.
- Mars Trek and USGS/Esri map services depend on their network availability and browser compatibility. The CTX mosaic layer is marked beta.
- JPL Horizons provides celestial-body ephemerides, not a live location for an arbitrary person or spacecraft. Browser GPS reports Earth coordinates only. A Mars or spacecraft position requires a mission telemetry or navigation source.
- The MEDA integration can ingest a product index; the index itself does not contain the calibrated measurements. MCD, MARCI, MCS, RAD, and AI4MARS references do not mean that their measurements or a trained model are integrated into risk analysis.
- Demo locations, crew positions, service examples, reports, and source-shaped example records are simulated interface data. They are labeled as demos and must not be treated as NASA observations, measured conditions, or model outputs.
- No validated hazard polygons, astronaut-safe thresholds, trained human-risk classifier, or operational safety verdict is provided. Route outputs and terrain metrics are exploratory decision-support context only.

## NASA data and resources

The following NASA data or resources are used by the app or are linked as source references. Where an item is only discoverable or catalogued, that status is stated explicitly.

| Resource | Use in MARSCOPE |
|---|---|
| [MGS MOLA MEGDR — NASA PDS Geosciences Node](https://pds-geosciences.wustl.edu/missions/mgs/megdr.html) | Global topography source for the local MOLA ingestion and terrain-processing workflow. Historical, coarse-resolution data. |
| [NASA Mars Trek tile services](https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars) | Mars map imagery and shaded-relief service references. |
| [NASA PDS Mars Orbital Data Explorer (ODE)](https://ode.rsl.wustl.edu/mars/tools.aspx) | Live product discovery and browse previews for THEMIS, CTX, HiRISE, CRISM, and SHARAD; product files are not automatically ingested into analysis. |
| [NASA/JPL Horizons API](https://ssd.jpl.nasa.gov/api/horizons.api) | Planet and Mars-moon position vectors for Solar System context, with caching and explicit source status. |
| [NASA NSSDC Planetary Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/planet_table_per.html) | Static planetary reference values. |
| [NASA Mars Moons](https://science.nasa.gov/mars/moons/) | Reference information about Phobos and Deimos. |
| [PDS MEDA calibrated ATS index](https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/logs/mars2020_meda_calibrated_ATS.csv) | Optional ingestion of the Perseverance product index; the index is not the measurement files. |
| [NASA Perseverance science highlights](https://science.nasa.gov/mission/mars-2020-perseverance/science-highlights/) | Context for mapped Jezero science locations. |
| [NASA Guide to Gale Crater](https://science.nasa.gov/wp-content/uploads/2024/03/32063_AGuideToGaleCrater-ts.pdf) | Gale Crater geological and mission context. |
| [NASA/JPL methane observations at Gale](https://www.jpl.nasa.gov/news/why-is-methane-seeping-on-mars-nasa-scientists-have-new-ideas/) | Context for unresolved methane observations; not a current reading. |
| [NASA SHARAD Utopia Planitia ice summary](https://science.nasa.gov/wp-content/uploads/2023/05/NuggetUtopiaWater20170127.pdf) | Regional context for orbital evidence of buried ice; not an accessible-resource measurement. |
| [NASA Curiosity organics study summary](https://science.nasa.gov/blogs/science-news/2026/02/06/nasa-study-non-biologic-processes-dont-fully-explain-mars-organics/) | Context for unresolved organic-compound observations; not evidence of life. |

The app also links to [NASA PDS MARCI](https://pds.nasa.gov/ds-view/pds/viewBundle.jsp?identifier=urn%3Anasa%3Apds%3Amars_mro_marci_dailyglobalmosaics_wang_2023&version=2.0), the [PDS Mars Climate Sounder archive](https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/MARS/mcs.html), the [PDS RAD archive](https://pds-ppi.igpp.ucla.edu/collection/MSL-M-RAD-3-RDR-V1.0%3ADATA), and the [NASA Open Data AI4MARS record](https://data.nasa.gov/dataset/ai4mars-a-dataset-for-terrain-aware-autonomous-driving-on-mars) as source references. Their measurements are not represented by MARSCOPE's demo fixtures; an AI4MARS model is not installed or trained.

## Space agency partner and other resources

| Resource | Use in MARSCOPE |
|---|---|
| [USGS Gazetteer of Planetary Nomenclature — GIS downloads](https://planetarynames.wr.usgs.gov/GIS_Downloads) | Source for IAU-approved planetary feature names. |
| [Mars nomenclature center-points KMZ](https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MARS_nomenclature_center_pts.kmz) | Public feature-center dataset used for map labels; the download is hosted on AWS and the data source is USGS. |
| [USGS-NASA Interactive Mars geologic maps](https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars) | Map reference; its geologic polygons are not currently rendered as an app layer. |
| [Caltech Murray Lab Global CTX Mosaic](https://murray-lab.caltech.edu/CTX/) | CTX mosaic source for the separate beta tile layer. |
| [Esri ArcGIS OnMars CTX tile service](https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer/tile/%7Bz%7D/%7By%7D/%7Bx%7D) | Third-party tile hosting for the beta CTX layer. |
| [Mars Climate Database (MCD)](https://www-mars.lmd.jussieu.fr/mars/access) | Catalog/reference entry only. No MCD measurements are ingested; MCD-shaped demo values are illustrative, not retrieved from the database. |
| [AI4MARS v0.6 on Zenodo](https://zenodo.org/records/15995036) | Dataset-edition reference only; no archive is bundled and no model is trained from it. Review the applicable license before using the archive. |

### Development tools and libraries

- [React](https://react.dev/), [React Router](https://reactrouter.com/), and [TypeScript](https://www.typescriptlang.org/) for the frontend.
- [CesiumJS](https://cesium.com/platform/cesiumjs/) and [Resium](https://resium.reearth.io/) for the 3D planetary maps.
- [Vite](https://vite.dev/) and [Tailwind CSS](https://tailwindcss.com/) for development and styling.
- [Python](https://www.python.org/) and [FastAPI](https://fastapi.tiangolo.com/) for backend APIs.
- [NumPy](https://numpy.org/), [Rasterio](https://rasterio.readthedocs.io/en/stable/), and [SciPy](https://scipy.org/) for geospatial processing.
- PostgreSQL and PostGIS are optional for durable mission-record storage; the local API can run in memory without them.
- [IBM Plex Sans and Mono via Google Fonts](https://fonts.google.com/specimen/IBM+Plex+Sans) for interface typography.

## Super Intelligence (SI) disclosure

OpenAI ChatGPT and Google Gemini assisted with research and information gathering, coding and debugging, writing and editing, and visual design/image creation. AI assistance was also used while developing the project's AI/ML architecture. The application does not contain a trained human-risk model or fabricated scientific measurements. Demo fixtures are clearly identified and are not used as scientific data or training labels. AI-generated visual assets in the application are marked as AI-generated; no NASA logo or mission identifier was generated or modified.

## Run locally

Requirements: Python 3.10 or later, Node.js/npm, and a modern browser. The API runs without PostgreSQL, NASA credentials, or downloaded datasets; some source-backed features require network access.

**Backend — terminal 1 (PowerShell):**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Frontend — terminal 2:**

```powershell
cd frontend
npm ci
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). The API docs are at `http://127.0.0.1:8000/docs`. The frontend defaults to that API address; set `VITE_API_BASE_URL` if the backend uses another host or port. Optional MOLA processing dependencies and data downloads are documented in [`backend/docs/geospatial-processing.md`](backend/docs/geospatial-processing.md).

## Data use and endorsement notice

NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites. For non-U.S. Government websites, participants must comply with any data use parameters of that specific website. NASA PDS datasets may be served through university-hosted PDS nodes; see the individual source for applicable access and data-use terms. External services are subject to their providers' availability and terms.

## Team

**Team ANORA** — Sithumini Anuhansi, Pabasara Ranasinghe, Pavani Perera, and Kavindu Vishwajith.
