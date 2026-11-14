import type { CrewMember } from '../../types/mission'
import { dutyStatusCopy } from '../../utils/format'
import { DashboardCard } from './DashboardCard'

interface CrewStatusProps {
  crew: CrewMember[]
}

const DUTY_TONE: Record<CrewMember['dutyStatus'], string> = {
  'on-eva': 'text-ember',
  'in-habitat': 'text-ok',
  rest: 'text-gold',
  comms: 'text-sand',
}

export function CrewStatus({ crew }: CrewStatusProps) {
  return (
    <DashboardCard
      title="Active crew members"
      eyebrow={`${crew.length} on roster`}
      action={<span className="font-mono text-2xl text-sand">{crew.length}</span>}
    >
      <ul className="space-y-3">
        {crew.map((member) => (
          <li
            key={member.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-line bg-charcoal/50 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-sand">
                {member.callSign}
                <span className="ml-2 text-muted">· {member.name}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {member.role} · {member.locationLabel}
              </p>
            </div>
            <span className={`shrink-0 text-[11px] tracking-wide uppercase ${DUTY_TONE[member.dutyStatus]}`}>
              {dutyStatusCopy(member.dutyStatus)}
            </span>
          </li>
        ))}
      </ul>
    </DashboardCard>
  )
}
