import axios, { isAxiosError } from 'axios'

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000'
const HEALTHY_STATUSES = new Set(['ok', 'healthy', 'online'])

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000,
  headers: {
    'Content-Type': 'application/json',
  },
})

export interface HealthCheckResponse {
  status: string
}

export function isHealthyResponse(data: unknown): data is HealthCheckResponse {
  if (typeof data !== 'object' || data === null) {
    return false
  }

  const status = 'status' in data ? data.status : undefined
  return typeof status === 'string' && HEALTHY_STATUSES.has(status.trim().toLowerCase())
}

export async function getBackendHealth(signal?: AbortSignal): Promise<HealthCheckResponse> {
  try {
    const { data, status } = await apiClient.get<unknown>('/api/v1/health', {
      signal,
      validateStatus: () => true,
    })

    if (status < 200 || status >= 300) {
      throw new Error(`Health check failed with HTTP ${status}`)
    }

    if (!isHealthyResponse(data)) {
      throw new Error('Health check returned an unexpected payload')
    }

    return { status: data.status.trim().toLowerCase() }
  } catch (error) {
    if (isAxiosError(error) && (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')) {
      throw new Error('Health check timed out')
    }

    throw error
  }
}
