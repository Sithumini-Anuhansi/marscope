import type { MissionStatusLevel } from '../../types/mission'
import { missionStatusCopy } from '../../utils/format'

interface StatusBadgeProps {
  status: MissionStatusLevel
  compact?: boolean
  /** Marks the status as sample/mock data (visible from md up, always announced to screen readers). */
  sample?: boolean
}

const STATUS_CLASSES: Record<MissionStatusLevel, string> = {
  nominal: 'border-ok/40 bg-ok/10 text-ok',
  caution: 'border-warn/40 bg-warn/10 text-warn',
  critical: 'border-mars/50 bg-mars/15 text-ember',
}

const DOT_CLASSES: Record<MissionStatusLevel, string> = {
  nominal: 'bg-ok shadow-[0_0_8px_rgba(61,186,139,0.8)]',
  caution: 'bg-warn shadow-[0_0_8px_rgba(224,165,74,0.8)]',
  critical: 'bg-mars shadow-[0_0_8px_rgba(194,74,50,0.8)]',
}

export function StatusBadge({ status, compact = false, sample = false }: StatusBadgeProps) {
  const label = missionStatusCopy(status)

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2 py-1 text-[11px] font-medium tracking-wide uppercase sm:px-2.5 ${STATUS_CLASSES[status]}`}
      title={sample ? `${label} (sample data)` : label}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[status]}`} aria-hidden="true" />
      <span className={compact ? 'hidden sm:inline' : undefined}>{label}</span>
      {sample ? (
        <span className="hidden font-normal tracking-normal normal-case opacity-70 md:inline">
          · sample
        </span>
      ) : null}
      {compact ? <span className="sr-only">{sample ? `${label} (sample data)` : label}</span> : null}
    </span>
  )
}
