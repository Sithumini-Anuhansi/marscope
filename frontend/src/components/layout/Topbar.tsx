import { Bell, Menu, Radio, UserRound } from 'lucide-react'
import { SAMPLE_OVERVIEW } from '../../data/sampleOverview'
import { useBackendHealth } from '../../hooks/useBackendHealth'
import { connectionCopy } from '../../utils/format'
import { StatusBadge } from '../common/StatusBadge'

interface TopbarProps {
  menuOpen: boolean
  onMenuClick: () => void
}

export function Topbar({ menuOpen, onMenuClick }: TopbarProps) {
  const connection = useBackendHealth()
  const { mission } = SAMPLE_OVERVIEW

  return (
    <header className="flex items-center justify-between gap-3 border-b border-line bg-charcoal/80 px-4 py-3 backdrop-blur-md md:gap-4 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="shrink-0 rounded-md border border-line p-2 text-sand lg:hidden"
          onClick={onMenuClick}
          aria-label="Open navigation"
          aria-controls="app-sidebar"
          aria-expanded={menuOpen}
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.2em] text-gold uppercase">
            Current mission
          </p>
          <p className="truncate text-sm font-medium text-sand md:text-base">{mission.name}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <StatusBadge status={mission.status} compact />

        <div
          className="flex items-center gap-2 rounded-full border border-line bg-panel px-2 py-1.5 text-[11px] text-muted sm:px-3"
          role="status"
          aria-live="polite"
        >
          <Radio
            className={`h-3.5 w-3.5 ${connection === 'online' ? 'text-ok' : 'text-mars'}`}
            aria-hidden="true"
          />
          <span className="sr-only sm:not-sr-only">{connectionCopy(connection)}</span>
        </div>

        <button
          type="button"
          className="relative hidden rounded-md border border-line p-2 text-sand sm:inline-flex"
          aria-label="Notifications (none connected)"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-mars" />
        </button>

        <div className="flex items-center gap-2 rounded-full border border-line bg-panel py-1 pr-1 pl-1 sm:pr-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-burgundy/60 text-gold">
            <UserRound className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="hidden leading-tight sm:block">
            <p className="text-xs font-medium text-sand">Ops Controller</p>
            <p className="font-mono text-[10px] text-muted">ANORA / Earth</p>
          </div>
        </div>
      </div>
    </header>
  )
}
