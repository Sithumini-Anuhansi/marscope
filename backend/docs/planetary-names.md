# Official Mars feature-name layer

MARSCOPE uses the nightly USGS Gazetteer of Planetary Nomenclature `MARS_nomenclature_center_pts.kmz` download, which lists IAU-adopted names and their center-point coordinates. The current source contains about 2,055 Mars features. It is a point-name layer; it does not contain the boundaries of named regions or geologic map units.

Download/cache it explicitly from `backend/`:

```powershell
python -m app.services.planetary_feature_catalog --download
```

The running map requests names in its current camera view from `GET /api/v1/science/named-features`. The visible-label layer adjusts its minimum feature diameter with map scale to keep the global view readable; zooming in requests smaller named features. The endpoint returns center points, feature type, diameter, and attribution. Local data is required, so application startup never depends on the external archive host.

The official USGS page links the KMZ on a non-government file host. Use the current source page and comply with its terms when refreshing or redistributing the file. NASA/JPL imagery credits and this gazetteer attribution do not represent NASA endorsement of MARSCOPE or of the hosting provider. The user-provided Curiosity route graphic and Perseverance raw image gallery remain linked references because they are not georeferenced feature datasets; Worldview is an Earth data viewer and is not used as Mars data.

Sources: [USGS Gazetteer GIS downloads](https://planetarynames.wr.usgs.gov/GIS_Downloads), [NASA/JPL Mars Trek](https://trek.nasa.gov/mars/), [NASA Curiosity proposed path](https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/), [NASA Perseverance raw image gallery](https://mars.nasa.gov/mars2020/multimedia/raw-images/), [NASA Worldview](https://worldview.earthdata.nasa.gov/).
