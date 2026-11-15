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

ODE location queries are not currently supported for every source. MCD, MEDA, MARCI, MCS, RAD, and AI4MARS remain outside this endpoint. In particular, MEDA is a Perseverance/Jezero-site weather record, RAD is Curiosity-site radiation, and MCD output is a modeled climatology; none should be misrepresented as a current Gale surface measurement.

Official references: [PDS ODE REST API](https://ode.rsl.wustl.edu/mars/tools.aspx), [ODE REST manual](https://oderest.rsl.wustl.edu/ODE_REST_V2.1.6.pdf), [HiRISE DTM product description](https://ode.rsl.wustl.edu/mars/pagehelp/Content/Missions_Instruments/Mars%20Reconnaissance%20Orbiter/HiRISE/HiRISE%20DTM.htm), [THEMIS products](https://ode.rsl.wustl.edu/mars2/pagehelp/Content/Missions_Instruments/Mars_Odyssey/THEMIS/Derived.htm), [CTX EDR](https://ode.rsl.wustl.edu/mars/pagehelp/Content/Missions_Instruments/Mars%20Reconnaissance%20Orbiter/CTX/CTX%20EDR.htm).
