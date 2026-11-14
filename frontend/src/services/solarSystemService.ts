import { API_BASE_URL } from './api'

export interface CelestialBody {
  id: string; name: string; classification: string; diameter_km: number | null; dimensions_km: number[] | null; mass_kg: number | null
  mean_distance_km: number | null; orbital_period_days: number | null; rotation_period_hours: number | null
  gravity_m_s2: number | null; mean_surface_temperature_c: number | null; atmosphere: string | null
  description: string; discovery: string | null; parent_id: string | null; reference_source: string; value_kind: string
}
export interface EphemerisVector { epoch: string; x_km: number; y_km: number; z_km: number; vx_km_s: number | null; vy_km_s: number | null; vz_km_s: number | null }
export interface EphemerisTrack { target: string; center: string; status: 'live' | 'cached' | 'stale' | 'unavailable'; fetched_at: string | null; cache_age_seconds: number | null; error: string | null; vectors: EphemerisVector[] }
export interface PositionsResponse { source: string; coordinate_frame: string; reference_plane: string; reference_system: string; time_scale: string; output_units: string; tracks: EphemerisTrack[] }

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/v1/solar-system${path}`, { signal })
  if (!response.ok) {
    let detail = `Astronomy service returned HTTP ${response.status}`
    try { const payload = await response.json() as { detail?: string }; if (payload.detail) detail = payload.detail } catch { /* Error body may be plain text. */ }
    throw new Error(detail)
  }
  return response.json() as Promise<T>
}
export function getCelestialBodies(signal?: AbortSignal): Promise<CelestialBody[]> { return request('/bodies', signal) }
export function getBodyDetails(bodyId: string, signal?: AbortSignal): Promise<CelestialBody> { return request(`/bodies/${encodeURIComponent(bodyId)}`, signal) }
export function getSolarPositions(start: string, stop: string, signal?: AbortSignal): Promise<PositionsResponse> {
  const params = new URLSearchParams({ targets: 'mercury,venus,earth,mars,jupiter,saturn,uranus,neptune', center: 'sun', start_time: start, stop_time: stop, step_size: '15 d' })
  return request(`/positions?${params}`, signal)
}
export function getMarsSystem(epoch: string, signal?: AbortSignal): Promise<PositionsResponse> {
  const params = new URLSearchParams({ epoch, orbit_window_hours: '48', orbit_step_hours: '2' })
  return request(`/mars-system?${params}`, signal)
}
