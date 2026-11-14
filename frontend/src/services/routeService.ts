import { apiClient } from './api'
import type { RoutePlanResponse, RoutePlannerStatus } from '../types/route'

export interface GenerateRouteInput {
  start: { latitude_deg: number; longitude_deg: number; latitude_type: 'planetocentric'; longitude_direction: 'positive-east' }
  destination: { latitude_deg: number; longitude_deg: number; latitude_type: 'planetocentric'; longitude_direction: 'positive-east' }
  maximum_source_cell_km: number
  maximum_slope_deg?: number
  slope_penalty_per_degree: number
  roughness_penalty_per_meter: number
  avoid_policy_classified_high_hazards: boolean
  alternative_count: number
  astronaut_id?: string
  mission_objective: 'balanced' | 'minimize_slope' | 'minimize_roughness'
}

export async function getRoutePlannerStatus(signal?: AbortSignal): Promise<RoutePlannerStatus> {
  const { data } = await apiClient.get<RoutePlannerStatus>('/api/v1/routes/status', { signal })
  return data
}

export async function generateRoute(input: GenerateRouteInput, signal?: AbortSignal): Promise<RoutePlanResponse> {
  const { data } = await apiClient.post<RoutePlanResponse>('/api/v1/routes/generate', input, { signal, timeout: 60_000 })
  return data
}
