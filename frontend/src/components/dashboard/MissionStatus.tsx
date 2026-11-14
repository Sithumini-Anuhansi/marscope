import type { MissionIdentity } from '../../types/mission'
import { StatusBadge } from '../common/StatusBadge'
import { DashboardCard } from './DashboardCard'

interface MissionStatusProps {
  mission: MissionIdentity
}

export function MissionStatus({ mission }: MissionStatusProps) {
  return (
    <DashboardCard title="Mission status" eyebrow="Sample mission data">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={mission.status} />
        <span className="font-mono text-xs text-muted">{mission.code}</span>
      </div>
      <p className="mt-4 text-lg font-medium break-words text-sand">{mission.name}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted">{mission.statusLabel}</p>
      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-line bg-charcoal/70 p-3">
          <dt className="text-[11px] tracking-wide text-muted uppercase">Phase</dt>
          <dd className="mt-1 capitalize">{mission.phase.replace('-', ' ')}</dd>
        </div>
        <div className="rounded-xl border border-line bg-charcoal/70 p-3">
          <dt className="text-[11px] tracking-wide text-muted uppercase">Sol</dt>
          <dd className="mt-1 font-mono">{mission.sol}</dd>
        </div>
      </dl>
      <p className="mt-4 font-mono text-xs text-gold/90">{mission.nextWindow}</p>
    </DashboardCard>
  )
}
