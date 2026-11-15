import { apiClient } from './api'
import type { MedaArchiveResponse, PlanetaryArchiveResponse, ScienceDemoResponse } from '../types/planetaryArchive'

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

export async function getMedaArchiveIndex(signal?: AbortSignal): Promise<MedaArchiveResponse> {
  const { data } = await apiClient.get<MedaArchiveResponse>('/api/v1/science/meda/index', { signal, timeout: 15_000 })
  return data
}

export async function getScienceDemoRecords(signal?: AbortSignal): Promise<ScienceDemoResponse> {
  const { data } = await apiClient.get<ScienceDemoResponse>('/api/v1/science/demo', { signal, timeout: 15_000 })
  return data
}
