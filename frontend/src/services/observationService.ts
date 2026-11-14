import { API_BASE_URL } from './api'

export type ObservationCategory = 'danger' | 'shelter' | 'water-ice' | 'resource' | 'discovery' | 'obstacle' | 'other'
export type VerificationStatus = 'unverified' | 'under-review' | 'verified' | 'rejected'
export interface Observation {
  id: string; mission_id: string; astronaut_id: string; category: ObservationCategory
  description: string; latitude_deg: number; longitude_deg: number; submitted_at: string
  severity: string | null; image_refs: string[]; verification_status: VerificationStatus
  supporting_evidence: string | null
}
export interface ObservationDraft { astronaut_id: string; category: ObservationCategory; description: string; latitude_deg: number; longitude_deg: number; severity?: string; image_refs: string[]; supporting_evidence?: string }
export const CATEGORIES: { id: ObservationCategory; label: string; color: string }[] = [
  { id: 'danger', label: 'Dangerous location', color: '#ef6868' },
  { id: 'shelter', label: 'Possible shelter', color: '#65c7a0' },
  { id: 'water-ice', label: 'Water / ice', color: '#68bfe9' },
  { id: 'resource', label: 'Resource', color: '#e8bd57' },
  { id: 'discovery', label: 'Scientific discovery', color: '#bd91ed' },
  { id: 'obstacle', label: 'Exploration obstacle', color: '#e08b55' },
  { id: 'other', label: 'Other observation', color: '#ded6c6' },
]
const headers = (actorId: string, role: string, token: string) => ({ 'X-Actor-ID': actorId, 'X-Actor-Role': role, 'X-Actor-Token': token, 'Content-Type': 'application/json' })
const base = (missionId: string) => `${API_BASE_URL}/api/v1/missions/${missionId}/observations`

export async function getObservations(missionId: string, filters: { category?: string; astronaut_id?: string; min_latitude?: number; max_latitude?: number; min_longitude?: number; max_longitude?: number } = {}): Promise<Observation[]> {
  const url = new URL(base(missionId)); Object.entries(filters).forEach(([key, value]) => value !== undefined && url.searchParams.set(key, String(value)))
  const response = await fetch(url); if (!response.ok) throw new Error(`Observation service returned HTTP ${response.status}`)
  return response.json() as Promise<Observation[]>
}
export async function createObservation(missionId: string, draft: ObservationDraft, actorId: string, token: string): Promise<Observation> {
  const response = await fetch(base(missionId), { method: 'POST', headers: headers(actorId, 'crew', token), body: JSON.stringify(draft) })
  if (!response.ok) throw new Error((await response.json()).detail ?? `Create failed with HTTP ${response.status}`)
  return response.json() as Promise<Observation>
}
export async function updateObservation(missionId: string, id: string, changes: Partial<ObservationDraft> & { verification_status?: VerificationStatus }, actorId: string, role: string, token: string): Promise<Observation> {
  const response = await fetch(`${base(missionId)}/${id}`, { method: 'PATCH', headers: headers(actorId, role, token), body: JSON.stringify(changes) })
  if (!response.ok) throw new Error((await response.json()).detail ?? `Update failed with HTTP ${response.status}`)
  return response.json() as Promise<Observation>
}
export async function deleteObservation(missionId: string, id: string, actorId: string, role: string, token: string): Promise<void> {
  const response = await fetch(`${base(missionId)}/${id}`, { method: 'DELETE', headers: headers(actorId, role, token) })
  if (!response.ok) throw new Error((await response.json()).detail ?? `Delete failed with HTTP ${response.status}`)
}
export function observationSocketUrl(missionId: string): string {
  const url = new URL(base(missionId) + '/live'); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; return url.toString()
}
