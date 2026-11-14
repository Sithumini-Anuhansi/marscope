import { getMissionCrew, type Astronaut } from './crewService'
import { getObservations, type Observation } from './observationService'

export interface NearbyDiscovery { observations: Array<Observation & { distanceKm: number }>; crew: Array<Astronaut & { distanceKm: number | null }>; radiusKm: number }

// MARSCOPE's map uses geodetic latitude and east-positive longitude on Mars.
const MARS_MEAN_RADIUS_KM = 3389.5
function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180
  const dLat = (bLat - aLat) * rad
  const dLon = (bLon - aLon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2
  return MARS_MEAN_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export async function discoverNearby(latitudeDeg: number, longitudeDeg: number, radiusKm = 25): Promise<NearbyDiscovery> {
  const latDelta = radiusKm / 59.27
  const cosLat = Math.max(0.05, Math.cos(latitudeDeg * Math.PI / 180))
  const lonDelta = Math.min(180, radiusKm / (59.27 * cosLat))
  const minLat = Math.max(-90, latitudeDeg - latDelta)
  const maxLat = Math.min(90, latitudeDeg + latDelta)
  const crewPromise = getMissionCrew()
  const observationPromise = Math.abs(longitudeDeg) + lonDelta > 180
    ? Promise.all([
        getObservations('ares-iv', { min_latitude: minLat, max_latitude: maxLat, min_longitude: -180, max_longitude: Math.min(180, longitudeDeg + lonDelta - 360) }),
        getObservations('ares-iv', { min_latitude: minLat, max_latitude: maxLat, min_longitude: Math.max(-180, longitudeDeg - lonDelta), max_longitude: 180 }),
      ]).then(([west, east]) => [...west, ...east])
    : getObservations('ares-iv', { min_latitude: minLat, max_latitude: maxLat, min_longitude: Math.max(-180, longitudeDeg - lonDelta), max_longitude: Math.min(180, longitudeDeg + lonDelta) })
  const [crew, observations] = await Promise.all([crewPromise, observationPromise])
  const nearbyObservations = observations.map((item) => ({ ...item, distanceKm: distanceKm(latitudeDeg, longitudeDeg, item.latitude_deg, item.longitude_deg) })).filter((item) => item.distanceKm <= radiusKm).sort((a, b) => a.distanceKm - b.distanceKm)
  const nearbyCrew = crew.astronauts.map((member) => ({ ...member, distanceKm: member.latitude_deg == null || member.longitude_deg == null ? null : distanceKm(latitudeDeg, longitudeDeg, member.latitude_deg, member.longitude_deg) })).filter((member) => member.distanceKm !== null && member.distanceKm <= radiusKm).sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
  return { observations: nearbyObservations, crew: nearbyCrew, radiusKm }
}
