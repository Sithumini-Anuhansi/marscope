import { apiClient } from './api'
import type { HazardLocationResponse } from '../types/hazard'

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
