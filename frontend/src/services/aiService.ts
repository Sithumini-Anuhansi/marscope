import { apiClient } from './api'
import type { AIServiceStatus, AIRiskSynthesisResponse, TerrainClassificationResponse } from '../types/ai'

export async function getAIServiceStatus(signal?: AbortSignal): Promise<AIServiceStatus> {
  const { data } = await apiClient.get<AIServiceStatus>('/api/v1/ai/status', { signal })
  return data
}

export async function submitAIRiskSynthesis(
  input: { latitude_deg: number; longitude_deg: number; terrain_assessment_id?: string },
  signal?: AbortSignal,
): Promise<AIRiskSynthesisResponse> {
  const { data } = await apiClient.post<AIRiskSynthesisResponse>('/api/v1/ai/risk/assess', input, { signal })
  return data
}

export async function classifyTerrainImage(file: File, signal?: AbortSignal): Promise<TerrainClassificationResponse> {
  const { data } = await apiClient.post<TerrainClassificationResponse>('/api/v1/ai/terrain/classify', file, {
    signal,
    headers: { 'Content-Type': file.type },
    transformRequest: [(value) => value],
  })
  return data
}
