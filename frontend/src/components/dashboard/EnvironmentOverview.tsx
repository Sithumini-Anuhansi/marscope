import type { EnvironmentReading } from '../../types/mission'
import { DashboardCard } from './DashboardCard'

interface EnvironmentOverviewProps {
  readings: EnvironmentReading[]
}

export function EnvironmentOverview({ readings }: EnvironmentOverviewProps) {
  return (
    <DashboardCard title="Mars environmental conditions" eyebrow="Sample UI values">
      <p className="mb-4 text-xs leading-relaxed text-muted">
        These figures are interface samples for layout development. They are not live telemetry and
        are not NASA scientific measurements.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {readings.map((reading) => (
          <li key={reading.id} className="rounded-xl border border-line bg-charcoal/60 p-3">
            <p className="text-[11px] tracking-wide text-muted uppercase">{reading.label}</p>
            <p className="mt-1 font-mono text-xl text-ember">{reading.displayValue}</p>
            <p className="mt-2 text-[11px] leading-snug text-muted">{reading.context}</p>
          </li>
        ))}
      </ul>
    </DashboardCard>
  )
}
