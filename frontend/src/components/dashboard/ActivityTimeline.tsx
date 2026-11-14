import type { TimelineEvent } from '../../types/mission'
import { DashboardCard } from './DashboardCard'

interface ActivityTimelineProps {
  events: TimelineEvent[]
}

const TONE_DOT: Record<TimelineEvent['tone'], string> = {
  nominal: 'bg-ok',
  alert: 'bg-mars',
  info: 'bg-gold',
}

export function ActivityTimeline({ events }: ActivityTimelineProps) {
  return (
    <DashboardCard title="Mission activity timeline" eyebrow="Sample log">
      <ol className="relative space-y-4 border-l border-line pl-4">
        {events.map((event) => (
          <li key={event.id} className="relative">
            <span
              className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${TONE_DOT[event.tone]}`}
            />
            <p className="font-mono text-[11px] text-muted">{event.timeLabel}</p>
            <p className="mt-0.5 text-sm font-medium text-sand">{event.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{event.detail}</p>
          </li>
        ))}
      </ol>
    </DashboardCard>
  )
}
