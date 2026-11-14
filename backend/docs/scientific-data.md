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

- The API registry now identifies concrete candidate products rather than claiming that the instruments are ingested: THEMIS IR-GEO V2; the Murray Lab global CTX mosaic v1; HiRISE map-projected RDR; and MRO MARCI/MCS products. It reports them as `catalogued-ingestion-not-implemented`. Each source is too large, product-specific, or spatially selective for an unbounded download in this application. Before ingestion, select one scene/product, obtain its PDS label and detached metadata, and write a product-specific validator/processor. MARCI imagery is not a direct wind or temperature measurement.
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
