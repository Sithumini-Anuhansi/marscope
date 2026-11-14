import { X } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from '../../utils/navigation'
import { BrandMark } from '../branding/BrandMark'

interface SidebarProps {
  open: boolean
  onNavigate: () => void
}

export function Sidebar({ open, onNavigate }: SidebarProps) {
  return (
    <aside
      id="app-sidebar"
      className={`fixed inset-y-0 left-0 z-40 flex w-[min(18rem,calc(100vw-1.5rem))] flex-col border-r border-line bg-charcoal/95 backdrop-blur-md transition-[transform,visibility] duration-200 lg:static lg:w-64 lg:translate-x-0 ${
        open ? 'translate-x-0' : '-translate-x-full max-lg:invisible'
      }`}
      aria-label="Primary"
    >
      <div className="border-b border-line px-4 py-4">
        <div className="mb-3 flex items-start justify-between gap-2 lg:hidden">
          <p className="font-mono text-[10px] tracking-[0.22em] text-gold uppercase">Navigation</p>
          <button
            type="button"
            className="rounded-md border border-line p-1.5 text-sand"
            onClick={onNavigate}
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <BrandMark compact />
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Interplanetary Survival Guide · Martian Map
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Mission modules">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      isActive
                        ? 'border border-mars/40 bg-burgundy/35 text-sand'
                        : 'border border-transparent text-muted hover:bg-panel-alt hover:text-sand'
                    }`
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">{item.label}</span>
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="border-t border-line px-5 py-4 text-[11px] leading-relaxed text-muted">
        Explore the Unknown. Survive the Journey. Find Your Way Home.
      </div>
    </aside>
  )
}
