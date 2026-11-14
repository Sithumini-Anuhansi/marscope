# Scientific data integration status

## MOLA MEGDR sample

The ingestion utility fetches only the 4 pixels-per-degree global MOLA topography image (`MEGT90N000CB`) and its PDS4 XML label. The IMG is 2,073,600 bytes (720 × 1440 cells, signed 16-bit big-endian meters). This is a deliberately low-resolution sample, not a rover-scale navigation DEM. The PDS label gives 14.817845349 km/pixel in both axes.

Run the download explicitly from `backend/` after installing requirements:

```powershell
python -m app.services.mola_ingestion --raw-dir ../data/raw/mola
```

Raw files are retained unchanged. A JSON manifest records source URLs, hashes, source period, conventions, and structural validation. The routine checks image length and parses the XML label, but does not parse all PDS metadata, verify an archive-provided checksum, quality-assess elevations, or convert to GeoTIFF. It does not run at API startup. If a download fails, staged temporary files are discarded; an earlier completed copy is retained.

The grid reports median topography per 0.25° bin relative to the MOLA areoid; the label says empty bins may be interpolated. Do not treat this old global dataset as current environmental conditions. The PDS4 product label gives a geometry span from 1997-09-15 through 2001-06-30. It specifies IAU2000_MARS planetocentric latitude, positive-east longitude, and an equirectangular projection with central meridian 180°. The ingest manifest copies these values from the product label.

## Other products

- THEMIS, CTX, HiRISE, and atmospheric products remain `planned` in the API registry. Their access method, product-level units, resolution, coordinate reference, and observation context must be taken from their individual PDS labels before ingestion is enabled.
- The frontend already catalogs NASA Mars Trek Viking MDIM and MOLA color shaded-relief WMTS layers. The MOLA WMTS is a rendered hillshade, not elevation measurements or a terrain mesh. Browser tile delivery and alignment still need a visual landmark check.
- The Murray Lab CTX via Esri OnMars entry is marked beta in the frontend because tile scheme and alignment have not been verified here.

## Authoritative references

- [NASA PDS Geosciences Node: MGS MOLA archive and PDS4 bundle](https://pds-geosciences.wustl.edu/missions/mgs/mola.html)
- [NASA PDS MEGDR collection: 128 pixels per degree](https://pds.nasa.gov/ds-view/pds/viewCollection.jsp?identifier=urn%3Anasa%3Apds%3Amgs_mola_topography_derived%3Adata_meg128)
- [PDS Geosciences Node: MOLA MEGDR format and product naming](https://ode.rsl.wustl.edu/mars/pagehelp/Content/Missions_Instruments/MGS/MOLA/MEGDR.htm)
- [NASA Mars Trek WMTS API and layer services](https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars)
