import { apiClient } from './api'
import type { RiskAssessmentRequest, RiskAssessmentResult, RiskServiceStatus } from '../types/risk'

export async function getRiskServiceStatus(signal?: AbortSignal): Promise<RiskServiceStatus> {
  const { data } = await apiClient.get<RiskServiceStatus>('/api/v1/risk/status', { signal })
  return data
}

export async function submitRiskAssessment(
  request: RiskAssessmentRequest,
  signal?: AbortSignal,
): Promise<RiskAssessmentResult> {
  const { data } = await apiClient.post<RiskAssessmentResult>('/api/v1/risk/assessments', request, { signal })
  return data
}

export async function getRiskAssessment(
  assessmentId: string,
  signal?: AbortSignal,
): Promise<RiskAssessmentResult> {
  const { data } = await apiClient.get<RiskAssessmentResult>(
    `/api/v1/risk/assessments/${encodeURIComponent(assessmentId)}`,
    { signal },
  )
  return data
}
