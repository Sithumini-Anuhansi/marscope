export type ImageryLayerId = 'viking-mdim' | 'mola-shade' | 'ctx-mosaic'

export type OperationalLayerId =
  | 'named-features'
  | 'terrain-elevation'
  | 'temperature'
  | 'wind'
  | 'dust-atmosphere'
  | 'hazards'
  | 'astronauts'
  | 'routes'
  | 'collab-markers'

export type MapLayerId = ImageryLayerId | OperationalLayerId

export type LayerAvailability = 'live' | 'coming-soon'

export type MapLayerCategory = 'imagery' | 'environment' | 'operations'

export interface MapLayerDefinition {
  id: MapLayerId
  category: MapLayerCategory
  label: string
  description: string
  availability: LayerAvailability
  defaultVisible: boolean
  credit?: string
  crs?: string
}

export interface GlobeDisplaySettings {
  showGlobe: boolean
  /** Decorative star backdrop only; not a Mars-accurate sky. */
  showStarfield: boolean
}

export interface MarsLonLat {
  /**
   * Geodetic latitude in degrees on Cesium's Mars ellipsoid, −90 to 90.
   * On this slightly flattened ellipsoid it differs from planetocentric latitude
   * by up to about 0.34° at mid-latitudes.
   */
  latitudeDeg: number
  /** East-positive longitude in degrees, wrapped to −180 to 180. */
  longitudeDeg: number
}

export interface PointerCoordinates extends MarsLonLat {
  /** Height above the Mars ellipsoid, in meters. Surface picks are ~0. */
  heightMeters: number
}

export interface CameraStatus {
  /** Geocentric range from the Mars ellipsoid surface, in meters. */
  altitudeMeters: number
}

export type ImageryRuntimeStatus =
  | 'loading'
  | 'ready'
  /** Some tile requests failed; the tiles that did load are still shown. */
  | 'degraded'
  /** Imagery providers could not be created at all. */
  | 'error'
  /** All imagery layers are switched off. */
  | 'ellipsoid-only'

export interface ImagerySourceRecord {
  id: ImageryLayerId
  title: string
  providerKind: 'wmts-rest' | 'url-template'
  urlTemplate: string
  format: 'image/jpeg' | 'image/png'
  tileSize: number
  minLevel: number
  maxLevel: number
  tiling: 'geographic-2x1'
  crs: string
  credit: string
  notes: string
}
