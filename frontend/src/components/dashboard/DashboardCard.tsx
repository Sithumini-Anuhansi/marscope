import type { ReactNode } from 'react'

interface DashboardCardProps {
  title: string
  eyebrow?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function DashboardCard({
  title,
  eyebrow,
  action,
  children,
  className = '',
}: DashboardCardProps) {
  return (
    <section
      className={`min-w-0 rounded-2xl border border-line bg-panel/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] md:p-5 ${className}`}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          {eyebrow ? (
            <p className="mb-1 font-mono text-[10px] tracking-[0.22em] text-gold uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="text-sm font-semibold tracking-wide break-words text-sand uppercase">{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}
