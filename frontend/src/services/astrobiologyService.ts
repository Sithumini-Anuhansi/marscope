import { apiClient } from './api'
import type { AstrobiologyMapsResponse } from '../types/astrobiology'

export async function getAstrobiologyMaps(signal?: AbortSignal): Promise<AstrobiologyMapsResponse> {
  const { data } = await apiClient.get<AstrobiologyMapsResponse>('/api/v1/science/astrobiology/maps', { signal })
  return data
}
