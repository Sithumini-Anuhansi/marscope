export type MissionPhase =
  | 'pre-launch'
  | 'transit'
  | 'surface-operations'
  | 'return-prep'
  | 'standby'

export type MissionStatusLevel = 'nominal' | 'caution' | 'critical'

export type ConnectionStatus = 'checking' | 'online' | 'offline'

export type CrewRole = 'Commander' | 'Science Officer' | 'Engineer' | 'Medical Officer'

export type CrewDutyStatus = 'on-eva' | 'in-habitat' | 'rest' | 'comms'

export type HazardSeverity = 'low' | 'moderate' | 'high'

export type ResourceCategory = 'power' | 'water' | 'oxygen' | 'consumables'

export interface MissionIdentity {
  code: string
  name: string
  operator: string
  sol: number
  phase: MissionPhase
  status: MissionStatusLevel
  statusLabel: string
  nextWindow: string
}

export interface EnvironmentReading {
  id: string
  label: string
  displayValue: string
  context: string
  source: 'sample-ui'
}

export interface CrewMember {
  id: string
  callSign: string
  name: string
  role: CrewRole
  dutyStatus: CrewDutyStatus
  locationLabel: string
}

export interface ResourceItem {
  id: string
  category: ResourceCategory
  label: string
  remainingPercent: number
  note: string
}

export interface MissionObservation {
  id: string
  title: string
  author: string
  region: string
  recordedAt: string
  summary: string
}

export interface TimelineEvent {
  id: string
  timeLabel: string
  title: string
  detail: string
  tone: 'nominal' | 'alert' | 'info'
}

export interface MapMarker {
  id: string
  kind: 'hazard' | 'crew' | 'waypoint'
  label: string
  x: number
  y: number
}

export interface OverviewSnapshot {
  mission: MissionIdentity
  environment: EnvironmentReading[]
  crew: CrewMember[]
  hazardCount: number
  safeLocationCount: number
  resources: ResourceItem[]
  observations: MissionObservation[]
  timeline: TimelineEvent[]
  mapMarkers: MapMarker[]
}
