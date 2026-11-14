import { API_BASE_URL } from './api'
export type CrewStatus = 'on-eva' | 'in-habitat' | 'rest' | 'comms' | 'stale' | 'untracked'
export interface CrewPosition { latitude_deg: number; longitude_deg: number; timestamp: string }
export interface Astronaut { id: string; name: string; role: string; status: CrewStatus; latitude_deg: number | null; longitude_deg: number | null; location_timestamp: string | null; path: CrewPosition[] }
export interface MissionCrew { id: string; name: string; astronauts: Astronaut[] }
export async function getMissionCrew(): Promise<MissionCrew> {
  const response = await fetch(`${API_BASE_URL}/api/v1/missions/ares-iv/crew`)
  if (!response.ok) throw new Error(`Crew service returned HTTP ${response.status}`)
  return response.json() as Promise<MissionCrew>
}
export function missionSocketUrl(): string {
  const url = new URL(API_BASE_URL)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/api/v1/missions/ares-iv/locations'
  return url.toString()
}
