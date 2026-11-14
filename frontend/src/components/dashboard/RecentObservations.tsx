import type { MissionObservation } from '../../types/mission'
import { DashboardCard } from './DashboardCard'

interface RecentObservationsProps {
  observations: MissionObservation[]
}

export function RecentObservations({ observations }: RecentObservationsProps) {
  return (
    <DashboardCard title="Recent mission observations" eyebrow="Sample crew notes">
      <ul className="space-y-3">
        {observations.map((observation) => (
          <li key={observation.id} className="rounded-xl border border-line bg-charcoal/50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-sand">{observation.title}</p>
              <span className="font-mono text-[11px] text-gold">{observation.recordedAt}</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {observation.author} · {observation.region}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-sand/80">{observation.summary}</p>
          </li>
        ))}
      </ul>
    </DashboardCard>
  )
}
