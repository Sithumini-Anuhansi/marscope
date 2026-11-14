import type { ConnectionStatus, CrewDutyStatus, MissionStatusLevel } from '../types/mission'

export function missionStatusCopy(status: MissionStatusLevel): string {
  if (status === 'nominal') return 'Nominal'
  if (status === 'caution') return 'Caution'
  return 'Critical'
}

export function dutyStatusCopy(status: CrewDutyStatus): string {
  if (status === 'on-eva') return 'On EVA'
  if (status === 'in-habitat') return 'In Habitat'
  if (status === 'rest') return 'Rest Cycle'
  return 'Comms Window'
}

export function connectionCopy(status: ConnectionStatus): string {
  if (status === 'checking') return 'Checking uplink'
  if (status === 'online') return 'Backend online'
  return 'Backend offline'
}
