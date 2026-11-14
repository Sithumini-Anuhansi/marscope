import { Cartesian3, Cartographic, Ellipsoid, Math as CesiumMath } from 'cesium'
import type { MarsLonLat } from '../types/map'

/**
 * Coordinate handling for MARSCOPE.
 *
 * Runtime globe: Cesium `Ellipsoid.MARS`, radii 3 396 190 m (equatorial) and
 * 3 376 200 m (polar). It is a slightly flattened ellipsoid, not a sphere and
 * not WGS84.
 *
 * User-facing values are degrees: latitude from −90 to 90 and east-positive
 * longitude wrapped to −180..180. Cesium `Cartographic` on this ellipsoid gives
 * GEODETIC latitude (angle of the surface normal), which is not identical to
 * planetocentric latitude (angle from the planet's center). The difference
 * peaks near 45° at about 0.34° (roughly 20 km). Do not treat these values as
 * interchangeable with planetocentric coordinates from a catalog.
 *
 * NASA Mars Trek WMTS layers declare EPSG:104905 (Mars 2000 geographic,
 * degrees) and a 2x1 geographic tile grid. Tiles are placed here with a
 * GeographicTilingScheme on MARS_ELLIPSOID. Whether Trek's rows are linear in
 * geodetic or planetocentric latitude has NOT been verified in this project, so
 * a small latitude-dependent offset (at most the 0.34° above) is possible.
 * Check against a known landmark before using coordinates for navigation.
 * Never apply Earth Web Mercator (EPSG:3857) or WGS84 geoid math to these tiles.
 */

export const MARS_ELLIPSOID = Ellipsoid.MARS

export const MARS_EQUATORIAL_RADIUS_METERS = MARS_ELLIPSOID.maximumRadius

export const MARS_POLAR_RADIUS_METERS = MARS_ELLIPSOID.minimumRadius

/** Default camera height for a whole-planet view, meters above the ellipsoid. */
export const MARS_HOME_HEIGHT_METERS = 14_000_000

export const MARS_HOME_LON_LAT: MarsLonLat = {
  latitudeDeg: 10,
  longitudeDeg: 0,
}

export function installMarsEllipsoid(): Ellipsoid {
  Ellipsoid.default = Ellipsoid.MARS
  return Ellipsoid.MARS
}

export function degreesToRadians(degrees: number): number {
  return CesiumMath.toRadians(degrees)
}

export function radiansToDegrees(radians: number): number {
  return CesiumMath.toDegrees(radians)
}

export function wrapLongitudeDegrees(longitudeDeg: number): number {
  const wrapped = ((((longitudeDeg + 180) % 360) + 360) % 360) - 180
  return wrapped === -180 ? 180 : wrapped
}

export function clampLatitudeDegrees(latitudeDeg: number): number {
  return Math.min(90, Math.max(-90, latitudeDeg))
}

/** Convert Cesium geodetic latitude to the planetocentric latitude expected by the MOLA API. */
export function geodeticToPlanetocentricLatitude(latitudeDeg: number): number {
  const latitude = degreesToRadians(clampLatitudeDegrees(latitudeDeg))
  const a2 = MARS_ELLIPSOID.maximumRadius ** 2
  const b2 = MARS_ELLIPSOID.minimumRadius ** 2
  return radiansToDegrees(Math.atan2(b2 * Math.sin(latitude), a2 * Math.cos(latitude)))
}

/** Convert a PDS planetocentric latitude to the geodetic latitude used by Cesium's Mars ellipsoid. */
export function planetocentricToGeodeticLatitude(latitudeDeg: number): number {
  const latitude = degreesToRadians(clampLatitudeDegrees(latitudeDeg))
  const a2 = MARS_ELLIPSOID.maximumRadius ** 2
  const b2 = MARS_ELLIPSOID.minimumRadius ** 2
  return radiansToDegrees(Math.atan2(a2 * Math.sin(latitude), b2 * Math.cos(latitude)))
}

export function lonLatToCartesian(
  longitudeDeg: number,
  latitudeDeg: number,
  heightMeters = 0,
  ellipsoid: Ellipsoid = MARS_ELLIPSOID,
): Cartesian3 {
  return Cartesian3.fromDegrees(
    wrapLongitudeDegrees(longitudeDeg),
    clampLatitudeDegrees(latitudeDeg),
    heightMeters,
    ellipsoid,
  )
}

export function cartographicToLonLat(cartographic: Cartographic): MarsLonLat {
  return {
    latitudeDeg: clampLatitudeDegrees(radiansToDegrees(cartographic.latitude)),
    longitudeDeg: wrapLongitudeDegrees(radiansToDegrees(cartographic.longitude)),
  }
}

export function formatLatitude(latitudeDeg: number, digits = 3): string {
  const hemisphere = latitudeDeg >= 0 ? 'N' : 'S'
  return `${Math.abs(latitudeDeg).toFixed(digits)}° ${hemisphere}`
}

export function formatLongitude(longitudeDeg: number, digits = 3): string {
  const wrapped = wrapLongitudeDegrees(longitudeDeg)
  const hemisphere = wrapped >= 0 ? 'E' : 'W'
  return `${Math.abs(wrapped).toFixed(digits)}° ${hemisphere}`
}

export function formatLonLat(position: MarsLonLat, digits = 3): string {
  return `${formatLatitude(position.latitudeDeg, digits)}, ${formatLongitude(position.longitudeDeg, digits)}`
}

export function formatAltitudeKm(meters: number, digits = 0): string {
  if (!Number.isFinite(meters)) return '—'
  if (Math.abs(meters) >= 1000) {
    return `${(meters / 1000).toFixed(digits)} km`
  }
  return `${meters.toFixed(0)} m`
}

export function marsHomeDestination(): Cartesian3 {
  return lonLatToCartesian(
    MARS_HOME_LON_LAT.longitudeDeg,
    MARS_HOME_LON_LAT.latitudeDeg,
    MARS_HOME_HEIGHT_METERS,
  )
}
