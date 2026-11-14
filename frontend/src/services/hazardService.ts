import { apiClient } from './api'
import type { HazardLocationResponse, HazardRegionResponse, HazardServiceStatus } from '../types/hazard'

export async function getHazardServiceStatus(signal?: AbortSignal): Promise<HazardServiceStatus> {
  const { data } = await apiClient.get<HazardServiceStatus>('/api/v1/hazards/status', { signal })
  return data
}

export async function getHazardAssessmentAtLocation(
  latitudeDeg: number,
  longitudeDeg: number,
  signal?: AbortSignal,
): Promise<HazardLocationResponse> {
  const { data } = await apiClient.get<HazardLocationResponse>('/api/v1/hazards/location', {
    params: { latitude_deg: latitudeDeg, longitude_deg: longitudeDeg },
    signal,
  })
  return data
}

export async function getHazardAssessmentForRegion(
  bounds: { west: number; south: number; east: number; north: number },
  categories?: string[],
  signal?: AbortSignal,
): Promise<HazardRegionResponse> {
  const { data } = await apiClient.get<HazardRegionResponse>('/api/v1/hazards/region', {
    params: {
      west_longitude_deg: bounds.west,
      south_latitude_deg: bounds.south,
      east_longitude_deg: bounds.east,
      north_latitude_deg: bounds.north,
      ...(categories?.length ? { categories: categories.join(',') } : {}),
    },
    signal,
  })
  return data
}
