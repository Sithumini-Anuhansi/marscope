import type { ResourceItem } from '../../types/mission'
import { DashboardCard } from './DashboardCard'

interface ResourceOverviewProps {
  resources: ResourceItem[]
}

export function ResourceOverview({ resources }: ResourceOverviewProps) {
  return (
    <DashboardCard title="Available resources" eyebrow="Sample margins">
      <ul className="space-y-4">
        {resources.map((resource) => (
          <li key={resource.id}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="text-sand">{resource.label}</span>
              <span className="font-mono text-gold">{resource.remainingPercent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-charcoal">
              <div
                className="h-full rounded-full bg-linear-to-r from-burgundy via-mars to-gold"
                style={{ width: `${resource.remainingPercent}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted">{resource.note}</p>
          </li>
        ))}
      </ul>
    </DashboardCard>
  )
}
