import {
  Credit,
  GeographicTilingScheme,
  UrlTemplateImageryProvider,
  WebMapTileServiceImageryProvider,
  type ImageryProvider,
} from 'cesium'
import type { ImageryLayerId, ImagerySourceRecord, MapLayerDefinition } from '../types/map'
import { MARS_ELLIPSOID } from '../utils/marsCoordinates'

/**
 * Modular Mars imagery catalog. Add a dataset by adding an `IMAGERY_SOURCES` entry
 * and a matching `MAP_LAYER_DEFINITIONS` entry.
 *
 * Status of each source (what has and has not been confirmed):
 * - Viking MDIM 2.1 and MOLA shaded relief (NASA Mars Trek WMTS, RESTful):
 *   the layer identifier, CRS (urn:ogc:def:crs:EPSG::104905), matrix set
 *   `default028mm` and a 2x1 level-0 tile grid are published in NASA's WMTS
 *   capabilities documents. NOT confirmed from this code base: that the tile URLs
 *   below return images from a browser (CORS, exact host and path), so open one
 *   tile URL in a browser once before relying on it. Both are imagery of the
 *   surface/relief, not a terrain mesh.
 * - CTX mosaic: served from Esri's `OnMars/CTX` tile cache (the cache NASA Trek
 *   lists for the Caltech Murray Lab mosaic). Its level numbering, tile size and
 *   CORS behaviour are UNVERIFIED. Treat it as a beta layer; if tiles are blank
 *   or offset, remove it rather than guessing a tiling scheme.
 *
 * Direct Murray Lab tile trees are not Cesium WMTS. No Cesium ion token is
 * required, and no secret keys are used in this file.
 */

const MARS_GEOGRAPHIC_TILES = new GeographicTilingScheme({
  ellipsoid: MARS_ELLIPSOID,
  numberOfLevelZeroTilesX: 2,
  numberOfLevelZeroTilesY: 1,
})

export const IMAGERY_SOURCES: Record<ImageryLayerId, ImagerySourceRecord> = {
  'viking-mdim': {
    id: 'viking-mdim',
    title: 'Viking MDIM 2.1 color mosaic',
    providerKind: 'wmts-rest',
    urlTemplate:
      'https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{TileMatrix}/{TileRow}/{TileCol}.jpg',
    format: 'image/jpeg',
    tileSize: 256,
    minLevel: 0,
    maxLevel: 7,
    tiling: 'geographic-2x1',
    crs: 'EPSG:104905 (Mars 2000 geographic / equirectangular)',
    credit: 'NASA / JPL / USGS — Viking MDIM 2.1 via NASA Mars Trek',
    notes:
      'Global color mosaic from Viking Orbiter. ~232 m/pixel source raster. Public NASA Trek WMTS.',
  },
  'mola-shade': {
    id: 'mola-shade',
    title: 'MOLA color shaded relief',
    providerKind: 'wmts-rest',
    urlTemplate:
      'https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/{TileMatrix}/{TileRow}/{TileCol}.jpg',
    format: 'image/jpeg',
    tileSize: 256,
    minLevel: 0,
    maxLevel: 7,
    tiling: 'geographic-2x1',
    crs: 'EPSG:104905 (Mars 2000 geographic / equirectangular)',
    credit: 'NASA / MGS MOLA — color shaded relief via NASA Mars Trek',
    notes:
      'Hillshade imagery derived from MOLA. This is a picture of relief, not sampled terrain heights.',
  },
  'ctx-mosaic': {
    id: 'ctx-mosaic',
    title: 'Murray Lab CTX mosaic (beta)',
    providerKind: 'url-template',
    urlTemplate: 'https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer/tile/{z}/{y}/{x}',
    format: 'image/png',
    tileSize: 512,
    minLevel: 0,
    maxLevel: 11,
    tiling: 'geographic-2x1',
    crs: 'EPSG:104905 (Mars 2000 geographic / equirectangular)',
    credit: 'Caltech Murray Lab / MSSS / NASA — CTX mosaic via Esri OnMars / NASA Trek catalog',
    notes:
      'Uncontrolled 5 m CTX mosaic. Tiles come from the Trek-listed ArcGIS cache, not a local invention.',
  },
}

export const IMAGERY_LAYER_IDS = Object.keys(IMAGERY_SOURCES) as ImageryLayerId[]

export const MAP_LAYER_DEFINITIONS: MapLayerDefinition[] = [
  {
    id: 'viking-mdim',
    category: 'imagery',
    label: 'Mars surface — Viking MDIM 2.1',
    description: 'Global Viking color mosaic from NASA Mars Trek WMTS.',
    availability: 'live',
    defaultVisible: true,
    credit: IMAGERY_SOURCES['viking-mdim'].credit,
    crs: IMAGERY_SOURCES['viking-mdim'].crs,
  },
  {
    id: 'mola-shade',
    category: 'imagery',
    label: 'Elevation — MOLA shaded relief',
    description: 'MOLA color hillshade imagery. Not a 3D terrain mesh.',
    availability: 'live',
    defaultVisible: false,
    credit: IMAGERY_SOURCES['mola-shade'].credit,
    crs: IMAGERY_SOURCES['mola-shade'].crs,
  },
  {
    id: 'ctx-mosaic',
    category: 'imagery',
    label: 'Mars surface — CTX mosaic (beta)',
    description:
      'Beta. Caltech Murray Lab CTX mosaic via Esri OnMars. Tile scheme not yet verified; may fail or look offset.',
    availability: 'live',
    defaultVisible: false,
    credit: IMAGERY_SOURCES['ctx-mosaic'].credit,
    crs: IMAGERY_SOURCES['ctx-mosaic'].crs,
  },
  {
    id: 'terrain-elevation',
    category: 'imagery',
    label: 'Elevation and terrain (3D mesh)',
    description: 'Quantized-mesh / 3D Tiles terrain is not connected yet. No fake DEM is shown.',
    availability: 'coming-soon',
    defaultVisible: false,
  },
  {
    id: 'temperature',
    category: 'environment',
    label: 'Temperature',
    description: 'Surface and atmospheric temperature rasters will attach here later.',
    availability: 'coming-soon',
    defaultVisible: false,
  },
  {
    id: 'wind',
    category: 'environment',
    label: 'Wind',
    description: 'Wind fields are reserved; no synthetic vectors are drawn.',
    availability: 'coming-soon',
    defaultVisible: false,
  },
  {
    id: 'dust-atmosphere',
    category: 'environment',
    label: 'Dust and atmosphere',
    description: 'Dust opacity and storm products will overlay the globe in a later phase.',
    availability: 'coming-soon',
    defaultVisible: false,
  },
  {
    id: 'hazards',
    category: 'operations',
    label: 'Terrain assessment (MOLA)',
    description: 'Click the globe to query derived terrain metrics. No severity classification is configured.',
    availability: 'live',
    defaultVisible: false,
  },
  {
    id: 'astronauts',
    category: 'operations',
    label: 'Astronaut positions',
    description: 'Live crew geolocation is not connected. No fictional EVA markers.',
    availability: 'coming-soon',
    defaultVisible: false,
  },
  {
    id: 'routes',
    category: 'operations',
    label: 'Exploration routes',
    description: 'Route planning is reserved for a later module.',
    availability: 'coming-soon',
    defaultVisible: false,
  },
  {
    id: 'collab-markers',
    category: 'operations',
    label: 'Collaborative markers',
    description: 'Shared annotations will appear here once mapping services exist.',
    availability: 'coming-soon',
    defaultVisible: false,
  },
]

export function createDefaultLayerVisibility(): Record<ImageryLayerId, boolean> {
  return {
    'viking-mdim': true,
    'mola-shade': false,
    'ctx-mosaic': false,
  }
}

function marsCredit(text: string): Credit {
  return new Credit(text, false)
}

export function createImageryProvider(id: ImageryLayerId): ImageryProvider {
  const source = IMAGERY_SOURCES[id]

  if (source.providerKind === 'url-template') {
    return new UrlTemplateImageryProvider({
      url: source.urlTemplate,
      credit: marsCredit(source.credit),
      ellipsoid: MARS_ELLIPSOID,
      tilingScheme: MARS_GEOGRAPHIC_TILES,
      tileWidth: source.tileSize,
      tileHeight: source.tileSize,
      minimumLevel: source.minLevel,
      maximumLevel: source.maxLevel,
      enablePickFeatures: false,
    })
  }

  return new WebMapTileServiceImageryProvider({
    url: source.urlTemplate,
    layer: source.id,
    style: 'default',
    format: source.format,
    tileMatrixSetID: 'default028mm',
    credit: marsCredit(source.credit),
    ellipsoid: MARS_ELLIPSOID,
    tilingScheme: MARS_GEOGRAPHIC_TILES,
    tileWidth: source.tileSize,
    tileHeight: source.tileSize,
    minimumLevel: source.minLevel,
    maximumLevel: source.maxLevel,
    enablePickFeatures: false,
  })
}
