import { apiClient } from './api'
import type { PlanetaryArchiveResponse } from '../types/planetaryArchive'

export async function getPlanetaryArchiveProducts(
  latitudeDeg: number,
  longitudeDeg: number,
  radiusKm = 20,
  signal?: AbortSignal,
): Promise<PlanetaryArchiveResponse> {
  const { data } = await apiClient.get<PlanetaryArchiveResponse>('/api/v1/science/products', {
    params: { latitude_deg: latitudeDeg, longitude_deg: longitudeDeg, radius_km: radiusKm },
    signal,
    timeout: 30_000,
  })
  return data
}
