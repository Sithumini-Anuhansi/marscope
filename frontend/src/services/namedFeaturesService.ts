import { apiClient } from './api'
import type { NamedMarsFeaturesResponse } from '../types/namedFeature'

export async function getNamedMarsFeatures(
  bounds: { west: number; south: number; east: number; north: number },
  minimumDiameterKm: number,
  signal?: AbortSignal,
): Promise<NamedMarsFeaturesResponse> {
  const { data } = await apiClient.get<NamedMarsFeaturesResponse>('/api/v1/science/named-features', {
    params: {
      west_deg: bounds.west,
      south_deg: bounds.south,
      east_deg: bounds.east,
      north_deg: bounds.north,
      minimum_diameter_km: minimumDiameterKm,
      limit: 2000,
    },
    signal,
  })
  return data
}
